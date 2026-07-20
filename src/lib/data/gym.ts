import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { forUser } from "@/db";
import { events, metricDatapoints, metrics, type GymSetLog } from "@/db/schema";
import { addDaysISO, parseISODate, toISODate } from "@/lib/dates";
import { weekStartISO } from "@/lib/calendar";
import {
  bestE1RM,
  E1RM_SUFFIX,
  isSessionLogged,
  liftFromMetricName,
  liftMetricName,
  sessionSetCounts,
  type SessionExercise,
  type TemplateExercise,
} from "@/lib/gym";

// --- payload shapes ----------------------------------------------------------

type TemplatePayload = { isTemplate: true; exercises: TemplateExercise[] };
type SessionPayload = {
  template?: string;
  templateId?: string;
  exercises: SessionExercise[];
};

const isTemplateSql = sql`(${events.payload} ->> 'isTemplate') = 'true'`;
const isSessionSql = sql`(${events.payload} ->> 'isTemplate') is distinct from 'true'`;

// --- serializable view types -------------------------------------------------

export type GymTemplate = { id: string; name: string; exercises: TemplateExercise[] };

export type GymSession = {
  id: string;
  dateISO: string;
  name: string;
  templateId: string | null;
  exercises: SessionExercise[];
  done: number;
  total: number;
  logged: boolean;
  isEnded: boolean;
};

export type PR = { lift: string; e1rm: number; whenISO: string };
export type LiftPoint = { dateISO: string; value: number };
export type AdherenceWeek = { weekStartISO: string; planned: number; completed: number };
export type GymWeekDay = { dateISO: string; label: string; done: boolean; planned: boolean };

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const sessionStart = (dateISO: string): Date => {
  const d = parseISODate(dateISO);
  d.setHours(7, 0, 0, 0);
  return d;
};

const toTemplate = (row: typeof events.$inferSelect): GymTemplate => ({
  id: row.id,
  name: row.title,
  exercises: (row.payload as TemplatePayload | null)?.exercises ?? [],
});

const toSession = (row: typeof events.$inferSelect): GymSession => {
  const payload = (row.payload as SessionPayload | null) ?? { exercises: [] };
  const exercises = payload.exercises ?? [];
  const { done, total } = sessionSetCounts(exercises);
  return {
    id: row.id,
    dateISO: toISODate(row.start),
    name: payload.template ?? row.title,
    templateId: payload.templateId ?? null,
    exercises,
    done,
    total,
    logged: isSessionLogged(exercises),
    isEnded: row.end !== null,
  };
};

// --- templates (FR-GYM.1) ----------------------------------------------------

export async function listTemplates(userId: string): Promise<GymTemplate[]> {
  const rows = await forUser(userId).select(events, {
    where: and(eq(events.domain, "gym"), eq(events.archived, false), isTemplateSql),
    orderBy: [events.title],
  });
  return rows.map(toTemplate);
}

export async function getTemplate(userId: string, id: string): Promise<GymTemplate | null> {
  const [row] = await forUser(userId).select(events, {
    where: and(eq(events.id, id), isTemplateSql),
  });
  return row && !row.archived ? toTemplate(row) : null;
}

export async function createTemplate(
  userId: string,
  input: { name: string; exercises: TemplateExercise[] },
): Promise<GymTemplate> {
  const [row] = await forUser(userId).insert(events, {
    domain: "gym",
    kind: "session",
    title: input.name,
    start: new Date(),
    payload: { isTemplate: true, exercises: input.exercises } satisfies TemplatePayload,
  });
  return toTemplate(row);
}

export async function updateTemplate(
  userId: string,
  id: string,
  input: { name: string; exercises: TemplateExercise[] },
): Promise<void> {
  await forUser(userId).update(
    events,
    {
      title: input.name,
      payload: { isTemplate: true, exercises: input.exercises } satisfies TemplatePayload,
    },
    and(eq(events.id, id), isTemplateSql),
  );
}

export async function archiveTemplate(userId: string, id: string): Promise<void> {
  await forUser(userId).update(
    events,
    { archived: true },
    and(eq(events.id, id), isTemplateSql),
  );
}

// --- sessions (FR-GYM.2) -----------------------------------------------------

export async function listSessions(
  userId: string,
  limit = 30,
): Promise<GymSession[]> {
  const rows = await forUser(userId).select(events, {
    where: and(
      eq(events.domain, "gym"),
      eq(events.kind, "session"),
      eq(events.archived, false),
      isSessionSql,
    ),
    orderBy: [desc(events.start)],
  });
  return rows.slice(0, limit).map(toSession);
}

export async function getSession(userId: string, id: string): Promise<GymSession | null> {
  const [row] = await forUser(userId).select(events, {
    where: and(eq(events.id, id), isSessionSql),
  });
  return row && !row.archived ? toSession(row) : null;
}

/** Most recent logged session for a template (for pre-fill), template excluded. */
async function lastSessionFor(
  userId: string,
  template: GymTemplate,
): Promise<GymSession | null> {
  const sessions = await listSessions(userId, 100);
  return (
    sessions.find(
      (s) => (s.templateId === template.id || s.name === template.name) && s.logged,
    ) ?? null
  );
}

/**
 * Pre-fills a new session from the template, seeding each set's weight/reps
 * from the last logged session of that template where available (FR-GYM.2),
 * else the template targets. Sets start unchecked.
 */
function prefill(template: GymTemplate, last: GymSession | null): SessionExercise[] {
  return template.exercises.map((ex) => {
    const prev = last?.exercises.find((e) => e.name === ex.name);
    const prevDone = prev?.sets.filter((s) => s.done) ?? [];
    const kg = prevDone.length ? prevDone[prevDone.length - 1].kg : ex.targetKg ?? 0;
    const reps = prevDone.length ? prevDone[prevDone.length - 1].reps : ex.targetReps;
    const sets: GymSetLog[] = Array.from({ length: Math.max(1, ex.targetSets) }, () => ({
      kg,
      reps,
      done: false,
    }));
    return { ...ex, sets };
  });
}

export async function startSessionFromTemplate(
  userId: string,
  templateId: string,
  dateISO: string,
): Promise<GymSession | null> {
  const template = await getTemplate(userId, templateId);
  if (!template) return null;
  const last = await lastSessionFor(userId, template);
  const [row] = await forUser(userId).insert(events, {
    domain: "gym",
    kind: "session",
    title: `Gym — ${template.name}`,
    start: sessionStart(dateISO),
    end: null,
    payload: {
      template: template.name,
      templateId: template.id,
      exercises: prefill(template, last),
    } satisfies SessionPayload,
  });
  return toSession(row);
}

async function writeSessionExercises(
  userId: string,
  session: typeof events.$inferSelect,
  exercises: SessionExercise[],
): Promise<void> {
  const payload = { ...(session.payload as SessionPayload), exercises };
  await forUser(userId).update(events, { payload }, eq(events.id, session.id));
  await recomputeSessionMetrics(userId, session.id, session.start, exercises);
}

/** Toggle/adjust one set (the sub-10s capture path). Recomputes e1RM metrics. */
export async function logSet(
  userId: string,
  sessionId: string,
  exerciseIdx: number,
  setIdx: number,
  patch: Partial<GymSetLog>,
): Promise<void> {
  const [row] = await forUser(userId).select(events, {
    where: and(eq(events.id, sessionId), isSessionSql),
  });
  if (!row) return;
  const exercises = (row.payload as SessionPayload).exercises ?? [];
  const ex = exercises[exerciseIdx];
  if (!ex || !ex.sets[setIdx]) return;
  ex.sets[setIdx] = { ...ex.sets[setIdx], ...patch };
  await writeSessionExercises(userId, row, exercises);
}

/** Append a set to an exercise, copying the last one's weight/reps. */
export async function addSet(
  userId: string,
  sessionId: string,
  exerciseIdx: number,
): Promise<void> {
  const [row] = await forUser(userId).select(events, {
    where: and(eq(events.id, sessionId), isSessionSql),
  });
  if (!row) return;
  const exercises = (row.payload as SessionPayload).exercises ?? [];
  const ex = exercises[exerciseIdx];
  if (!ex) return;
  const last = ex.sets[ex.sets.length - 1];
  ex.sets.push({ kg: last?.kg ?? ex.targetKg ?? 0, reps: last?.reps ?? ex.targetReps, done: false });
  await writeSessionExercises(userId, row, exercises);
}

export async function archiveSession(userId: string, id: string): Promise<void> {
  await forUser(userId).update(events, { archived: true }, and(eq(events.id, id), isSessionSql));
}

export async function endSession(userId: string, id: string): Promise<void> {
  await forUser(userId).update(events, { end: new Date() }, and(eq(events.id, id), isSessionSql));
}

/** Most recent OTHER logged session of the same template, for "LAST:" hints. */
export async function previousSession(
  userId: string,
  session: GymSession,
): Promise<GymSession | null> {
  const sessions = await listSessions(userId, 200);
  return (
    sessions.find(
      (s) =>
        s.id !== session.id &&
        s.logged &&
        (session.templateId
          ? s.templateId === session.templateId
          : s.name === session.name),
    ) ?? null
  );
}

// --- e1RM / PR metrics (FR-GYM.3) --------------------------------------------

async function gymLiftMetrics(udb: ReturnType<typeof forUser>) {
  const rows = await udb.select(metrics, {
    where: and(eq(metrics.domain, "gym"), sql`${metrics.name} like ${"%" + E1RM_SUFFIX}`),
  });
  return new Map(rows.map((m) => [liftFromMetricName(m.name), m]));
}

/**
 * Recomputes this session's contribution to each lift's e1RM Metric: one
 * datapoint per lift sourced `gym:<sessionId>`, so re-logging is idempotent.
 * Lifts with no logged sets contribute nothing (and any stale point is cleared).
 */
export async function recomputeSessionMetrics(
  userId: string,
  sessionId: string,
  when: Date,
  exercises: SessionExercise[],
): Promise<void> {
  const udb = forUser(userId);
  const byLift = await gymLiftMetrics(udb);
  const source = `gym:${sessionId}`;

  for (const ex of exercises) {
    const best = bestE1RM(ex.sets);
    let metric = byLift.get(ex.name);

    if (!metric) {
      if (best == null) continue; // nothing to record, no metric needed yet
      [metric] = await udb.insert(metrics, {
        domain: "gym",
        name: liftMetricName(ex.name),
        unit: "kg",
        direction: "higher-better",
      });
      byLift.set(ex.name, metric);
    }

    // clear this session's prior point for the lift, then re-add if logged
    await udb.delete(
      metricDatapoints,
      and(eq(metricDatapoints.metricId, metric.id), eq(metricDatapoints.source, source)),
    );
    if (best != null) {
      await udb.insert(metricDatapoints, {
        metricId: metric.id,
        timestamp: when,
        value: best,
        source,
      });
    }
  }
}

export async function listPRs(userId: string): Promise<PR[]> {
  const udb = forUser(userId);
  const byLift = await gymLiftMetrics(udb);
  if (byLift.size === 0) return [];
  // one query for all lifts' datapoints — was one query per lift (serial)
  const allPoints = await udb.select(metricDatapoints, {
    where: inArray(metricDatapoints.metricId, [...byLift.values()].map((m) => m.id)),
  });
  const byMetric = new Map<string, typeof allPoints>();
  for (const p of allPoints) {
    (byMetric.get(p.metricId) ?? byMetric.set(p.metricId, []).get(p.metricId)!).push(p);
  }
  const prs: PR[] = [];
  for (const [lift, metric] of byLift) {
    const points = byMetric.get(metric.id) ?? [];
    if (points.length === 0) continue;
    const top = points.reduce((a, b) => (b.value > a.value ? b : a));
    prs.push({ lift, e1rm: top.value, whenISO: toISODate(top.timestamp) });
  }
  return prs.sort((a, b) => b.e1rm - a.e1rm);
}

/** Datapoints for one lift over the last `weeks`, oldest→newest, for the chart. */
export async function liftSeries(
  userId: string,
  lift: string,
  weeks = 8,
): Promise<LiftPoint[]> {
  const udb = forUser(userId);
  const byLift = await gymLiftMetrics(udb);
  const metric = byLift.get(lift);
  if (!metric) return [];
  const from = parseISODate(addDaysISO(toISODate(new Date()), -7 * weeks));
  const points = await udb.select(metricDatapoints, {
    where: and(eq(metricDatapoints.metricId, metric.id), gte(metricDatapoints.timestamp, from)),
    orderBy: [metricDatapoints.timestamp],
  });
  return points.map((p) => ({ dateISO: toISODate(p.timestamp), value: p.value }));
}

/** Lifts that have an e1RM metric, heaviest PR first (chart picker order). */
export async function listLifts(userId: string): Promise<string[]> {
  return (await listPRs(userId)).map((p) => p.lift);
}

// --- adherence (FR-GYM.4) ----------------------------------------------------

async function gymSessionsInRange(
  udb: ReturnType<typeof forUser>,
  fromISO: string,
  toISOExclusive: string,
): Promise<GymSession[]> {
  const rows = await udb.select(events, {
    where: and(
      eq(events.domain, "gym"),
      eq(events.kind, "session"),
      eq(events.archived, false),
      isSessionSql,
      gte(events.start, parseISODate(fromISO)),
      lt(events.start, parseISODate(toISOExclusive)),
    ),
    orderBy: [events.start],
  });
  return rows.map(toSession);
}

export async function weeklyAdherence(userId: string, weeks = 8): Promise<AdherenceWeek[]> {
  const udb = forUser(userId);
  const thisWeek = weekStartISO(toISODate(new Date()));
  const rangeStart = addDaysISO(thisWeek, -7 * (weeks - 1));
  // one range query, bucketed in JS — was one query per week (serial waterfall)
  const sessions = await gymSessionsInRange(udb, rangeStart, addDaysISO(thisWeek, 7));

  const buckets = new Map<string, { planned: number; completed: number }>();
  for (const s of sessions) {
    const week = weekStartISO(s.dateISO);
    const b = buckets.get(week) ?? { planned: 0, completed: 0 };
    b.planned += 1;
    if (s.logged) b.completed += 1;
    buckets.set(week, b);
  }

  const out: AdherenceWeek[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDaysISO(thisWeek, -7 * i);
    const b = buckets.get(start) ?? { planned: 0, completed: 0 };
    out.push({ weekStartISO: start, planned: b.planned, completed: b.completed });
  }
  return out;
}

/**
 * This week's gym days for the adherence strip (planned vs done) — ALWAYS
 * exactly 7 unique consecutive dates (Mon–Sun), one entry per calendar day.
 *
 * Sessions are bucketed by dateISO rather than mapped 1:1, because a day can
 * carry more than one session Event (an AM + PM split, or — as the seed data
 * deliberately exercises for calendar-overlap testing — several concurrent
 * sessions on one day). Mapping sessions directly, one row per row, used to
 * emit duplicate dateISO entries whenever that happened, which the UI keys
 * lists on (`key={d.dateISO}`) — a duplicate key is a React console error,
 * not just a cosmetic wrinkle. `done` is true if ANY session that day was
 * logged; `planned` is true if any session exists that day at all (kept for
 * type compatibility — no current caller reads it, but a day with sessions
 * should not read as unplanned).
 */
export async function thisWeekDays(userId: string): Promise<GymWeekDay[]> {
  const udb = forUser(userId);
  const start = weekStartISO(toISODate(new Date()));
  const sessions = await gymSessionsInRange(udb, start, addDaysISO(start, 7));

  const byDate = new Map<string, { done: boolean; planned: boolean }>();
  for (const s of sessions) {
    const bucket = byDate.get(s.dateISO) ?? { done: false, planned: false };
    bucket.done ||= s.logged;
    bucket.planned = true;
    byDate.set(s.dateISO, bucket);
  }

  return Array.from({ length: 7 }, (_, i) => {
    const dateISO = addDaysISO(start, i);
    const bucket = byDate.get(dateISO);
    return {
      dateISO,
      label: DOW[parseISODate(dateISO).getDay()],
      done: bucket?.done ?? false,
      planned: bucket?.planned ?? false,
    };
  });
}
