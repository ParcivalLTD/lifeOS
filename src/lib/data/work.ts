/**
 * Work module data layer (spec §8.6) — a thin view over the core, no private
 * tables:
 *
 * - **Projects are Events** (domain=work, kind=deadline,
 *   `payload.work="project"`, start = the deadline) → they STAY on the
 *   unified calendar as deadlines (FR-WORK.2). A project's `goal_id` points
 *   at its project Goal; its NEXT ACTIONS are ordinary Tasks whose goal_id
 *   is that goal.
 * - **Achievements are Events** (kind=other, `payload.work="achievement"`,
 *   context in the payload) — log entries, not schedule items, so
 *   `calendarVisible` excludes exactly that discriminator value.
 * - **Time tracking is a Metric per project** (`<title> hours`, FR-WORK.4):
 *   every quick-duration tap or timer stop APPENDS one datapoint sourced
 *   `work:<projectId>` (entries are additive facts — unlike net worth, they
 *   are never replaced). The project payload stores the metricId so renames
 *   don't orphan history, and `timerStartedAt` for the running timer.
 *
 * All queries go through forUser (RLS-bypass rule).
 */
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { forUser } from "@/db";
import { events, goals, metricDatapoints, metrics, tasks } from "@/db/schema";
import { weekStartISO } from "@/lib/calendar";
import { addDaysISO, parseISODate, toISODate } from "@/lib/dates";
import { elapsedHours, round2 } from "@/lib/work";

// --- payload shapes ----------------------------------------------------------

type ProjectPayload = {
  work: "project";
  metricId?: string;
  timerStartedAt?: string | null;
};
type AchievementPayload = { work: "achievement"; context?: string | null };

const workIs = (kind: string) => sql`(${events.payload} ->> 'work') = ${kind}`;
const workBase = (kind: string) =>
  and(eq(events.domain, "work"), eq(events.archived, false), workIs(kind));

// --- view types --------------------------------------------------------------

export type WorkProject = {
  id: string;
  title: string;
  dueISO: string;
  goalId: string | null;
  metricId: string | null;
  timerStartedAt: string | null;
};

export type Achievement = {
  id: string;
  dateISO: string;
  title: string;
  context: string | null;
};

export type NextAction = { id: string; title: string; dueDate: string | null; priority: number };

export type ProjectOverview = WorkProject & {
  goalTitle: string | null;
  next: NextAction | null;
  tasksDone: number;
  tasksTotal: number;
  weekHours: number;
};

export type WorkOverview = {
  todayISO: string;
  projects: ProjectOverview[];
  weekTotal: { hours: number; projects: number };
  achievements: Achievement[];
};

const midday = (dateISO: string): Date => {
  const d = parseISODate(dateISO);
  d.setHours(12, 0, 0, 0);
  return d;
};

const toProject = (row: typeof events.$inferSelect): WorkProject => {
  const p = row.payload as ProjectPayload;
  return {
    id: row.id,
    title: row.title,
    dueISO: toISODate(row.start),
    goalId: row.goalId,
    metricId: p.metricId ?? null,
    timerStartedAt: p.timerStartedAt ?? null,
  };
};

// --- projects (FR-WORK.2) ------------------------------------------------------

export async function listProjects(userId: string): Promise<WorkProject[]> {
  const rows = await forUser(userId).select(events, {
    where: workBase("project"),
    orderBy: [events.start],
  });
  return rows.map(toProject);
}

export const getProject = async (userId: string, id: string): Promise<WorkProject | null> =>
  (await listProjects(userId)).find((p) => p.id === id) ?? null;

export async function createProject(
  userId: string,
  input: { title: string; dueISO: string; goalId?: string | null },
): Promise<string> {
  const [row] = await forUser(userId).insert(events, {
    domain: "work",
    kind: "deadline",
    title: input.title.trim(),
    start: midday(input.dueISO),
    allDay: true,
    goalId: input.goalId ?? null,
    payload: { work: "project" } satisfies ProjectPayload,
  });
  return row.id;
}

export async function updateProject(
  userId: string,
  id: string,
  input: { title: string; dueISO: string; goalId?: string | null },
): Promise<void> {
  const udb = forUser(userId);
  const [row] = await udb.select(events, { where: and(eq(events.id, id), workIs("project")) });
  if (!row) return;
  await udb.update(
    events,
    {
      title: input.title.trim(),
      start: midday(input.dueISO),
      goalId: input.goalId ?? null,
      payload: row.payload as ProjectPayload, // metricId/timer preserved
    },
    eq(events.id, id),
  );
}

export async function archiveProject(userId: string, id: string): Promise<void> {
  await forUser(userId).update(events, { archived: true }, and(eq(events.id, id), workIs("project")));
}

// --- time tracking (FR-WORK.4) ---------------------------------------------------

/** Project's hours Metric, created on first use; id cached in the payload. */
async function ensureProjectMetric(userId: string, projectId: string): Promise<string | null> {
  const udb = forUser(userId);
  const [row] = await udb.select(events, {
    where: and(eq(events.id, projectId), workIs("project")),
  });
  if (!row) return null;
  const payload = row.payload as ProjectPayload;
  if (payload.metricId) return payload.metricId;

  const [metric] = await udb.insert(metrics, {
    domain: "work",
    name: `${row.title} hours`,
    unit: "h",
    direction: "higher-better",
  });
  await udb.update(
    events,
    { payload: { ...payload, metricId: metric.id } satisfies ProjectPayload },
    eq(events.id, projectId),
  );
  return metric.id;
}

/** Append a time entry (quick-duration tap or timer stop). Additive fact —
 * multiple entries per day accumulate, nothing is replaced. */
export async function logProjectTime(
  userId: string,
  projectId: string,
  hours: number,
  when: Date = new Date(),
): Promise<void> {
  if (!(hours > 0)) return;
  const metricId = await ensureProjectMetric(userId, projectId);
  if (!metricId) return;
  await forUser(userId).insert(metricDatapoints, {
    metricId,
    timestamp: when,
    value: Math.min(round2(hours), 24),
    source: `work:${projectId}`,
  });
}

async function writeTimer(userId: string, projectId: string, startedAt: string | null): Promise<void> {
  const udb = forUser(userId);
  const [row] = await udb.select(events, {
    where: and(eq(events.id, projectId), workIs("project")),
  });
  if (!row) return;
  const payload = row.payload as ProjectPayload;
  await udb.update(
    events,
    { payload: { ...payload, timerStartedAt: startedAt } satisfies ProjectPayload },
    eq(events.id, projectId),
  );
}

/** Start/stop in one call (the two-tap flow): running → log elapsed + clear;
 * idle → stamp the start time. */
export async function toggleTimer(userId: string, projectId: string): Promise<void> {
  const project = await getProject(userId, projectId);
  if (!project) return;
  if (project.timerStartedAt) {
    await logProjectTime(userId, projectId, elapsedHours(project.timerStartedAt, new Date()));
    await writeTimer(userId, projectId, null);
  } else {
    await writeTimer(userId, projectId, new Date().toISOString());
  }
}

/** This week's tracked hours per project (Mon-start, like gym adherence). */
export async function weeklyHours(
  userId: string,
  projects: WorkProject[],
): Promise<Map<string, number>> {
  const withMetric = projects.filter((p) => p.metricId);
  const out = new Map<string, number>();
  if (withMetric.length === 0) return out;
  const start = weekStartISO(toISODate(new Date()));
  const points = await forUser(userId).select(metricDatapoints, {
    where: and(
      inArray(metricDatapoints.metricId, withMetric.map((p) => p.metricId!)),
      gte(metricDatapoints.timestamp, parseISODate(start)),
      lt(metricDatapoints.timestamp, parseISODate(addDaysISO(start, 7))),
    ),
  });
  const byMetric = new Map(withMetric.map((p) => [p.metricId!, p.id]));
  for (const pt of points) {
    const projectId = byMetric.get(pt.metricId);
    if (projectId) out.set(projectId, round2((out.get(projectId) ?? 0) + pt.value));
  }
  return out;
}

// --- achievements (FR-WORK.3) ------------------------------------------------------

export async function listAchievements(userId: string): Promise<Achievement[]> {
  const rows = await forUser(userId).select(events, {
    where: workBase("achievement"),
    orderBy: [desc(events.start), desc(events.createdAt)],
  });
  return rows.map((r) => ({
    id: r.id,
    dateISO: toISODate(r.start),
    title: r.title,
    context: (r.payload as AchievementPayload).context ?? null,
  }));
}

export async function addAchievement(
  userId: string,
  input: { title: string; context?: string | null; dateISO: string },
): Promise<void> {
  await forUser(userId).insert(events, {
    domain: "work",
    kind: "other",
    title: input.title.trim(),
    start: midday(input.dateISO),
    allDay: true,
    payload: {
      work: "achievement",
      context: input.context?.trim() || null,
    } satisfies AchievementPayload,
  });
}

export async function archiveAchievement(userId: string, id: string): Promise<void> {
  await forUser(userId).update(events, { archived: true }, and(eq(events.id, id), workIs("achievement")));
}

// --- page overview (one gather) -----------------------------------------------------

export async function workOverview(userId: string): Promise<WorkOverview> {
  const today = toISODate(new Date());
  const projects = await listProjects(userId);
  const goalIds = projects.map((p) => p.goalId).filter((g): g is string => g != null);

  const [achievements, hours, goalRows, taskRows] = await Promise.all([
    listAchievements(userId),
    weeklyHours(userId, projects),
    forUser(userId).select(goals, { where: eq(goals.archived, false) }),
    goalIds.length
      ? forUser(userId).select(tasks, {
          where: and(eq(tasks.archived, false), inArray(tasks.goalId, goalIds)),
        })
      : Promise.resolve([]),
  ]);
  const goalTitleById = new Map(goalRows.map((g) => [g.id, g.title]));

  const overviews: ProjectOverview[] = projects.map((p) => {
    const linked = taskRows.filter((t) => t.goalId === p.goalId && p.goalId != null);
    const open = linked
      .filter((t) => t.status === "open")
      .sort(
        (a, b) =>
          a.priority - b.priority || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"),
      );
    const done = linked.filter((t) => t.status === "done").length;
    const next = open[0]
      ? { id: open[0].id, title: open[0].title, dueDate: open[0].dueDate, priority: open[0].priority }
      : null;
    return {
      ...p,
      goalTitle: p.goalId ? goalTitleById.get(p.goalId) ?? null : null,
      next,
      tasksDone: done,
      tasksTotal: done + open.length,
      weekHours: hours.get(p.id) ?? 0,
    };
  });

  const tracked = overviews.filter((p) => p.weekHours > 0);
  return {
    todayISO: today,
    projects: overviews,
    weekTotal: {
      hours: round2(tracked.reduce((s, p) => s + p.weekHours, 0)),
      projects: tracked.length,
    },
    achievements,
  };
}
