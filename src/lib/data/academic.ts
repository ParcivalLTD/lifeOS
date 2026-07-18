/**
 * Academic module data layer (spec §8.5) — a thin view over the core, no
 * private tables:
 *
 * - **Courses are Events** (domain=academic, `payload.acad="course"`), like
 *   finance records: definitions, not dated occurrences, so `calendarVisible`
 *   excludes anything with an `acad` payload key.
 * - **Assessments are Events** (kind=deadline) with `payload.courseId` +
 *   weight/grade — real dated deadlines, so they STAY on the unified
 *   calendar (FR-ACAD.2, FR-CAL.1).
 * - **Study sessions are Events** (kind=session) with `payload.courseId` +
 *   hours — they appear on the calendar as blocks (FR-ACAD.3).
 * - **Course grades are Metrics** (`<CODE> grade`): grading recomputes one
 *   datapoint per course sourced `acad:<courseId>` (idempotent, like gym
 *   e1RM / net worth), and the metric is auto-linked —relates-to→ the
 *   course's Goal so the goal engine's progress picks it up (FR-ACAD.1/4).
 *
 * All queries go through forUser (RLS-bypass rule).
 */
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { forUser } from "@/db";
import { events, goals, metricDatapoints, metrics } from "@/db/schema";
import { computePace, currentGrade, round1, type Pace } from "@/lib/academic";
import { weekStartISO } from "@/lib/calendar";
import { addDaysISO, parseISODate, toISODate } from "@/lib/dates";
import { linkMetricToGoal } from "@/lib/data/goals";

// --- payload shapes ----------------------------------------------------------

type CoursePayload = {
  acad: "course";
  code: string;
  semester?: string | null;
  targetGrade?: number | null;
  plannedHours?: number | null; // study h/week (FR-ACAD.3 "planned")
};
type AssessmentPayload = {
  courseId: string;
  name: string;
  weight: number | null;
  grade?: number | null;
};
type StudyPayload = { courseId: string; hours: number };

const isCourseSql = sql`(${events.payload} ->> 'acad') = 'course'`;
const hasCourseIdSql = sql`${events.payload} is not null and jsonb_exists(${events.payload}, 'courseId')`;

const acadBase = and(eq(events.domain, "academic"), eq(events.archived, false));

// --- view types --------------------------------------------------------------

export type Course = {
  id: string;
  code: string;
  name: string;
  semester: string | null;
  targetGrade: number | null;
  plannedHours: number | null;
  goalId: string | null;
};

export type Assessment = {
  id: string;
  courseId: string;
  name: string;
  weight: number | null;
  grade: number | null;
  dueISO: string;
};

export type StudySession = { id: string; courseId: string; hours: number; dateISO: string };

const midday = (dateISO: string): Date => {
  const d = parseISODate(dateISO);
  d.setHours(12, 0, 0, 0);
  return d;
};

const toCourse = (row: typeof events.$inferSelect): Course => {
  const p = row.payload as CoursePayload;
  return {
    id: row.id,
    code: p.code,
    name: row.title,
    semester: p.semester ?? null,
    targetGrade: p.targetGrade ?? null,
    plannedHours: p.plannedHours ?? null,
    goalId: row.goalId,
  };
};

const toAssessment = (row: typeof events.$inferSelect): Assessment => {
  const p = row.payload as AssessmentPayload;
  return {
    id: row.id,
    courseId: p.courseId,
    name: p.name,
    weight: p.weight ?? null,
    grade: p.grade ?? null,
    dueISO: toISODate(row.start),
  };
};

// --- courses (FR-ACAD.1/2) ----------------------------------------------------

export async function listCourses(userId: string): Promise<Course[]> {
  const rows = await forUser(userId).select(events, {
    where: and(acadBase, isCourseSql),
    orderBy: [events.title],
  });
  return rows.map(toCourse).sort((a, b) => a.code.localeCompare(b.code));
}

export const getCourse = async (userId: string, id: string): Promise<Course | null> =>
  (await listCourses(userId)).find((c) => c.id === id) ?? null;

export type CourseInput = {
  code: string;
  name: string;
  semester?: string | null;
  targetGrade?: number | null;
  plannedHours?: number | null;
  goalId?: string | null;
};

const coursePayload = (input: CourseInput): CoursePayload => ({
  acad: "course",
  code: input.code.trim().toUpperCase(),
  semester: input.semester?.trim() || null,
  targetGrade: input.targetGrade ?? null,
  plannedHours: input.plannedHours ?? null,
});

export async function createCourse(userId: string, input: CourseInput): Promise<string> {
  const [row] = await forUser(userId).insert(events, {
    domain: "academic",
    kind: "other",
    title: input.name.trim(),
    start: new Date(),
    goalId: input.goalId ?? null,
    payload: coursePayload(input),
  });
  return row.id;
}

export async function updateCourse(userId: string, id: string, input: CourseInput): Promise<void> {
  await forUser(userId).update(
    events,
    { title: input.name.trim(), goalId: input.goalId ?? null, payload: coursePayload(input) },
    and(eq(events.id, id), isCourseSql),
  );
  await recomputeCourseGrade(userId, id); // code/target may have changed
}

/** Archives the course AND its assessments (module-managed); study-session
 * history stays — logged hours are fact. */
export async function archiveCourse(userId: string, id: string): Promise<void> {
  const udb = forUser(userId);
  await udb.update(events, { archived: true }, and(eq(events.id, id), isCourseSql));
  await udb.update(
    events,
    { archived: true },
    and(eq(events.domain, "academic"), eq(events.kind, "deadline"), sql`(${events.payload} ->> 'courseId') = ${id}`),
  );
}

// --- assessments (FR-ACAD.2) ---------------------------------------------------

export async function listAssessments(userId: string): Promise<Assessment[]> {
  const rows = await forUser(userId).select(events, {
    where: and(acadBase, eq(events.kind, "deadline"), hasCourseIdSql),
    orderBy: [events.start],
  });
  return rows.map(toAssessment);
}

export async function createAssessment(
  userId: string,
  input: { courseId: string; name: string; weight: number | null; dueISO: string },
): Promise<void> {
  const course = await getCourse(userId, input.courseId);
  if (!course) return;
  await forUser(userId).insert(events, {
    domain: "academic",
    kind: "deadline",
    title: `${course.code} — ${input.name.trim()}`,
    start: midday(input.dueISO),
    allDay: true,
    goalId: course.goalId,
    payload: {
      courseId: course.id,
      name: input.name.trim(),
      weight: input.weight,
    } satisfies AssessmentPayload,
  });
}

/** Grade capture (the module's fastest flow). null clears a grade. */
export async function setGrade(userId: string, assessmentId: string, grade: number | null): Promise<void> {
  const udb = forUser(userId);
  const [row] = await udb.select(events, {
    where: and(eq(events.id, assessmentId), eq(events.kind, "deadline"), hasCourseIdSql),
  });
  if (!row) return;
  const p = row.payload as AssessmentPayload;
  await udb.update(
    events,
    { payload: { ...p, grade: grade == null ? null : round1(grade) } satisfies AssessmentPayload },
    eq(events.id, assessmentId),
  );
  await recomputeCourseGrade(userId, p.courseId);
}

export async function archiveAssessment(userId: string, id: string): Promise<void> {
  const udb = forUser(userId);
  const [row] = await udb.select(events, { where: and(eq(events.id, id), hasCourseIdSql) });
  if (!row) return;
  await udb.update(events, { archived: true }, eq(events.id, id));
  await recomputeCourseGrade(userId, (row.payload as AssessmentPayload).courseId);
}

// --- course grade Metric (FR-ACAD.2 "Events + Metrics") ------------------------

const gradeMetricName = (code: string) => `${code} grade`;

/**
 * Recomputes the course's weighted current grade into its `<CODE> grade`
 * Metric: one datapoint per day sourced `acad:<courseId>` (replaced in
 * place — idempotent like the net-worth recompute). No graded work → no
 * datapoint, and today's stale one is cleared. First write auto-links the
 * metric —relates-to→ the course Goal for goal-engine progress.
 */
export async function recomputeCourseGrade(userId: string, courseId: string): Promise<void> {
  const udb = forUser(userId);
  const course = await getCourse(userId, courseId);
  if (!course) return;

  const assessments = (await listAssessments(userId)).filter((a) => a.courseId === courseId);
  const grade = currentGrade(assessments);
  const source = `acad:${courseId}`;

  let [metric] = await udb.select(metrics, {
    where: and(eq(metrics.domain, "academic"), eq(metrics.name, gradeMetricName(course.code))),
  });
  if (!metric) {
    if (grade == null) return; // nothing to record, no metric needed yet
    [metric] = await udb.insert(metrics, {
      domain: "academic",
      name: gradeMetricName(course.code),
      unit: "%",
      direction: "higher-better",
    });
    if (course.goalId) await linkMetricToGoal(userId, metric.id, course.goalId, "academic");
  }

  const today = toISODate(new Date());
  await udb.delete(
    metricDatapoints,
    and(
      eq(metricDatapoints.metricId, metric.id),
      eq(metricDatapoints.source, source),
      gte(metricDatapoints.timestamp, parseISODate(today)),
      lt(metricDatapoints.timestamp, parseISODate(addDaysISO(today, 1))),
    ),
  );
  if (grade != null) {
    await udb.insert(metricDatapoints, {
      metricId: metric.id,
      timestamp: midday(today),
      value: grade,
      source,
    });
  }
}

// --- study sessions (FR-ACAD.3) -------------------------------------------------

export async function logStudySession(
  userId: string,
  input: { courseId: string; hours: number; dateISO: string },
): Promise<void> {
  const course = await getCourse(userId, input.courseId);
  if (!course || !(input.hours > 0)) return;
  const hours = Math.min(round1(input.hours), 24);
  const start = midday(input.dateISO);
  const end = new Date(start.getTime() + hours * 3_600_000);
  await forUser(userId).insert(events, {
    domain: "academic",
    kind: "session",
    title: `Study — ${course.code}`,
    start,
    end,
    goalId: course.goalId,
    payload: { courseId: course.id, hours } satisfies StudyPayload,
  });
}

async function studySessionsInRange(
  userId: string,
  fromISO: string,
  toISOExclusive: string,
): Promise<StudySession[]> {
  const rows = await forUser(userId).select(events, {
    where: and(
      acadBase,
      eq(events.kind, "session"),
      hasCourseIdSql,
      gte(events.start, parseISODate(fromISO)),
      lt(events.start, parseISODate(toISOExclusive)),
    ),
    orderBy: [events.start],
  });
  return rows.map((r) => {
    const p = r.payload as StudyPayload;
    return { id: r.id, courseId: p.courseId, hours: p.hours, dateISO: toISODate(r.start) };
  });
}

export type WeeklyStudyRow = {
  courseId: string;
  code: string;
  planned: number | null;
  actual: number;
};

/** This week's logged hours vs the course's planned h/week (FR-ACAD.3). */
export async function weeklyStudy(userId: string, courses: Course[]): Promise<WeeklyStudyRow[]> {
  const start = weekStartISO(toISODate(new Date()));
  const sessions = await studySessionsInRange(userId, start, addDaysISO(start, 7));
  const actualByCourse = new Map<string, number>();
  for (const s of sessions) {
    actualByCourse.set(s.courseId, round1((actualByCourse.get(s.courseId) ?? 0) + s.hours));
  }
  return courses.map((c) => ({
    courseId: c.id,
    code: c.code,
    planned: c.plannedHours,
    actual: actualByCourse.get(c.id) ?? 0,
  }));
}

// --- page overview (one gather) --------------------------------------------------

export type CourseOverview = Course & {
  goalTitle: string | null;
  currentGrade: number | null;
  pace: Pace;
  assessments: Assessment[];
};

export type AcademicOverview = {
  todayISO: string;
  semesterLabel: string | null;
  courses: CourseOverview[];
  study: WeeklyStudyRow[];
  /** page-level average; basis states exactly what it is */
  avg: { current: number | null; target: number | null; basis: string };
  paceLine: string;
};

export async function academicOverview(userId: string): Promise<AcademicOverview> {
  const today = toISODate(new Date());
  const courses = await listCourses(userId);
  const [assessments, study, goalRows] = await Promise.all([
    listAssessments(userId),
    weeklyStudy(userId, courses),
    forUser(userId).select(goals, { where: eq(goals.archived, false) }),
  ]);
  const goalTitleById = new Map(goalRows.map((g) => [g.id, g.title]));

  const overviews: CourseOverview[] = courses.map((c) => {
    const rows = assessments
      .filter((a) => a.courseId === c.id)
      .sort((a, b) => a.dueISO.localeCompare(b.dueISO));
    return {
      ...c,
      goalTitle: c.goalId ? goalTitleById.get(c.goalId) ?? null : null,
      currentGrade: currentGrade(rows),
      pace: computePace(c.targetGrade, rows, today),
      assessments: rows,
    };
  });

  const graded = overviews.filter((c) => c.currentGrade != null);
  const targets = courses.filter((c) => c.targetGrade != null);
  const avgCurrent = graded.length
    ? round1(graded.reduce((s, c) => s + (c.currentGrade ?? 0), 0) / graded.length)
    : null;
  const avgTarget =
    targets.length === courses.length && courses.length > 0
      ? round1(targets.reduce((s, c) => s + (c.targetGrade ?? 0), 0) / targets.length)
      : null;
  const avgBasis =
    avgCurrent == null
      ? "NO GRADED WORK YET"
      : `MEAN OF CURRENT COURSE GRADES — ${graded.length}/${courses.length} COURSES GRADED, GRADED WORK ONLY`;

  const atRisk = overviews.find((c) => c.pace.flag === "at-risk");
  const tight = overviews.find((c) => c.pace.flag === "tight");
  const noInputs = overviews.filter((c) => c.pace.flag === "no-target" || c.pace.flag === "no-data");
  const hoursNote = (c: CourseOverview): string => {
    const row = study.find((s) => s.courseId === c.id);
    return row && row.planned != null ? ` — ${row.actual} OF ${row.planned} PLANNED HOURS LOGGED` : "";
  };
  const paceLine = atRisk
    ? `PACE FLAG: ${atRisk.code} ${atRisk.pace.basis}${hoursNote(atRisk)}`
    : tight
      ? `PACE FLAG: ${tight.code} ${tight.pace.basis}${hoursNote(tight)}`
      : courses.length === 0
        ? "NO COURSES YET"
        : noInputs.length
          ? `PACE INPUTS MISSING FOR ${noInputs.map((c) => c.code).join(", ")} — NOT GUESSING`
          : "ALL COURSES ON PACE";

  return {
    todayISO: today,
    semesterLabel: courses.find((c) => c.semester)?.semester ?? null,
    courses: overviews,
    study,
    avg: { current: avgCurrent, target: avgTarget, basis: avgBasis },
    paceLine,
  };
}
