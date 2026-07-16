import { and, eq } from "drizzle-orm";
import { forUser } from "@/db";
import { goals, habits, links, metricDatapoints, metrics } from "@/db/schema";
import { toISODate } from "@/lib/dates";
import { listHabitsWithStats } from "@/lib/data/habits";
import { listSavings, type SavingsGoal } from "@/lib/data/finance";
import {
  clampPct,
  HORIZONS,
  mean,
  metricProgressPct,
  parseTarget,
  type Horizon,
  type MetricDirection,
  type ProgressBasis,
} from "@/lib/goals";
import type { Domain } from "@/lib/domains";

type GoalRowDb = typeof goals.$inferSelect;

export type GoalProgress = { pct: number; basis: ProgressBasis };

export type GoalListItem = {
  id: string;
  title: string;
  domain: Domain;
  horizon: Horizon;
  status: string;
  targetDate: string | null;
  pct: number;
  basis: ProgressBasis;
  sub: string;
};

export type LinkedMetric = {
  metricId: string;
  name: string;
  unit: string | null;
  direction: MetricDirection;
  current: number | null;
  target: number | null;
  pct: number | null;
  trend: { dateISO: string; value: number }[];
};

export type LinkedHabit = { id: string; title: string; adherence7: number; streak: number };
export type CrossLink = { linkId: string; relation: string; title: string; direction: "out" | "in"; kind: string };

export type GoalDetail = {
  id: string;
  title: string;
  description: string | null;
  domain: Domain;
  horizon: Horizon;
  status: string;
  targetDate: string | null;
  successCriteria: string | null;
  parent: { id: string; title: string } | null;
  progress: GoalProgress;
  children: GoalListItem[];
  metrics: LinkedMetric[];
  habits: LinkedHabit[];
  savings: (SavingsGoal & { pct: number })[];
  crossLinks: CrossLink[];
};

// ---------------------------------------------------------------------------
// Shared context: everything progress needs, fetched once.
// ---------------------------------------------------------------------------

async function loadContext(userId: string) {
  const udb = forUser(userId);
  const today = toISODate(new Date());

  const [goalRows, linkRows, habitRows, metricRows, datapoints, savings, habitStats] =
    await Promise.all([
      udb.select(goals, { where: eq(goals.archived, false) }),
      udb.select(links),
      udb.select(habits, { where: eq(habits.archived, false) }),
      udb.select(metrics, { where: eq(metrics.archived, false) }),
      udb.select(metricDatapoints),
      listSavings(userId),
      listHabitsWithStats(userId, today),
    ]);

  const goalById = new Map(goalRows.map((g) => [g.id, g]));
  const childrenByParent = new Map<string, GoalRowDb[]>();
  for (const g of goalRows) {
    if (!g.parentGoalId) continue;
    (childrenByParent.get(g.parentGoalId) ?? childrenByParent.set(g.parentGoalId, []).get(g.parentGoalId)!).push(g);
  }

  const metricById = new Map(metricRows.map((m) => [m.id, m]));
  const latestByMetric = new Map<string, number>();
  const tsByMetric = new Map<string, Date>();
  for (const dp of datapoints) {
    const t = tsByMetric.get(dp.metricId);
    if (!t || dp.timestamp > t) {
      tsByMetric.set(dp.metricId, dp.timestamp);
      latestByMetric.set(dp.metricId, dp.value);
    }
  }

  const adherenceByHabit = new Map(habitStats.habits.map((h) => [h.id, h.adherence7]));
  const habitsByGoal = new Map<string, typeof habitRows>();
  for (const h of habitRows) {
    if (!h.goalId) continue;
    (habitsByGoal.get(h.goalId) ?? habitsByGoal.set(h.goalId, []).get(h.goalId)!).push(h);
  }

  // metric —relates-to→ goal
  const metricsByGoal = new Map<string, string[]>();
  // savings event —funds→ goal
  const savingsById = new Map(savings.map((s) => [s.id, s]));
  const savingsByGoal = new Map<string, SavingsGoal[]>();
  for (const l of linkRows) {
    if (l.toType === "goal" && l.relation === "relates-to" && l.fromType === "metric") {
      (metricsByGoal.get(l.toId) ?? metricsByGoal.set(l.toId, []).get(l.toId)!).push(l.fromId);
    }
    if (l.toType === "goal" && l.relation === "funds" && l.fromType === "event") {
      const s = savingsById.get(l.fromId);
      if (s) (savingsByGoal.get(l.toId) ?? savingsByGoal.set(l.toId, []).get(l.toId)!).push(s);
    }
  }

  return {
    goalRows, goalById, childrenByParent, linkRows,
    metricById, latestByMetric, metricsByGoal,
    habitsByGoal, adherenceByHabit, savingsById, savingsByGoal,
    datapoints,
  };
}

type Ctx = Awaited<ReturnType<typeof loadContext>>;

/** Progress for a goal from real signals; memoised, cycle-safe. */
function computeProgress(ctx: Ctx, id: string, seen = new Set<string>()): GoalProgress {
  const g = ctx.goalById.get(id);
  if (!g) return { pct: 0, basis: "none" };
  if (g.status === "achieved") return { pct: 100, basis: "achieved" };
  if (g.status === "abandoned" || seen.has(id)) return { pct: 0, basis: "none" };
  seen.add(id);

  const signals: number[] = [];
  let basis: ProgressBasis = "none";

  const children = ctx.childrenByParent.get(id) ?? [];
  for (const c of children) signals.push(computeProgress(ctx, c.id, seen).pct);
  if (children.length) basis = "milestones";

  const target = parseTarget(`${g.title} ${g.successCriteria ?? ""}`);
  for (const metricId of ctx.metricsByGoal.get(id) ?? []) {
    const metric = ctx.metricById.get(metricId);
    const current = ctx.latestByMetric.get(metricId);
    if (metric && current != null && target != null) {
      signals.push(metricProgressPct(current, target, metric.direction));
      if (basis === "none") basis = "metric";
    }
  }

  for (const h of ctx.habitsByGoal.get(id) ?? []) {
    signals.push(ctx.adherenceByHabit.get(h.id) ?? 0);
    if (basis === "none") basis = "habits";
  }

  for (const s of ctx.savingsByGoal.get(id) ?? []) {
    signals.push(s.target > 0 ? clampPct((s.current / s.target) * 100) : 0);
    if (basis === "none") basis = "savings";
  }

  seen.delete(id);
  if (!signals.length) return { pct: 0, basis: "none" };
  return { pct: Math.round(mean(signals)), basis };
}

/** Short metadata line under a goal's title (derived, never fabricated). */
function subFor(ctx: Ctx, g: GoalRowDb, p: GoalProgress): string {
  const children = ctx.childrenByParent.get(g.id) ?? [];
  if (p.basis === "achieved") return "ACHIEVED";
  if (children.length) {
    const done = children.filter((c) => c.status === "achieved").length;
    return `${done}/${children.length} MILESTONES`;
  }
  const metricIds = ctx.metricsByGoal.get(g.id) ?? [];
  if (metricIds.length) {
    const m = ctx.metricById.get(metricIds[0]);
    const cur = ctx.latestByMetric.get(metricIds[0]);
    const target = parseTarget(`${g.title} ${g.successCriteria ?? ""}`);
    if (m && cur != null) return `${m.name.toUpperCase()} ${cur}${target ? ` / ${target}` : ""}${m.unit ? " " + m.unit.toUpperCase() : ""}`;
  }
  const gh = ctx.habitsByGoal.get(g.id) ?? [];
  if (gh.length) return `${gh.length} RECURRING ACTION${gh.length === 1 ? "" : "S"}`;
  const gs = ctx.savingsByGoal.get(g.id) ?? [];
  if (gs.length) return `FUNDED BY ${gs.length} SAVINGS GOAL${gs.length === 1 ? "" : "S"}`;
  return (g.successCriteria ?? "").toUpperCase().slice(0, 48);
}

const toItem = (ctx: Ctx, g: GoalRowDb): GoalListItem => {
  const p = computeProgress(ctx, g.id);
  return {
    id: g.id, title: g.title, domain: g.domain, horizon: g.horizon,
    status: g.status, targetDate: g.targetDate, pct: p.pct, basis: p.basis,
    sub: subFor(ctx, g, p),
  };
};

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

/** Active goals grouped by horizon (FR-GOAL.2). */
export async function goalsByHorizon(
  userId: string,
): Promise<{ horizon: Horizon; label: string; goals: GoalListItem[] }[]> {
  const ctx = await loadContext(userId);
  const active = ctx.goalRows.filter((g) => g.status === "active");
  return HORIZONS.map((h) => ({
    horizon: h,
    label: h.toUpperCase(),
    goals: active.filter((g) => g.horizon === h).map((g) => toItem(ctx, g)),
  })).filter((group) => group.goals.length > 0);
}

/** Top active goals for the Today dashboard, most-progressed first. */
export async function topActiveGoals(userId: string, limit = 5): Promise<GoalListItem[]> {
  const ctx = await loadContext(userId);
  return ctx.goalRows
    .filter((g) => g.status === "active")
    .map((g) => toItem(ctx, g))
    .sort((a, b) => HORIZONS.indexOf(a.horizon) - HORIZONS.indexOf(b.horizon) || b.pct - a.pct)
    .slice(0, limit);
}

export async function activeGoalCount(userId: string): Promise<number> {
  const rows = await forUser(userId).select(goals, { where: and(eq(goals.archived, false), eq(goals.status, "active")) });
  return rows.length;
}

export async function getGoalDetail(userId: string, id: string): Promise<GoalDetail | null> {
  const ctx = await loadContext(userId);
  const g = ctx.goalById.get(id);
  if (!g) return null;

  const progress = computeProgress(ctx, id);
  const parentRow = g.parentGoalId ? ctx.goalById.get(g.parentGoalId) : null;
  const children = (ctx.childrenByParent.get(id) ?? []).map((c) => toItem(ctx, c));

  const target = parseTarget(`${g.title} ${g.successCriteria ?? ""}`);
  const linkedMetrics: LinkedMetric[] = (ctx.metricsByGoal.get(id) ?? []).map((mid) => {
    const m = ctx.metricById.get(mid)!;
    const current = ctx.latestByMetric.get(mid) ?? null;
    const trend = ctx.datapoints
      .filter((dp) => dp.metricId === mid)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .slice(-8)
      .map((dp) => ({ dateISO: toISODate(dp.timestamp), value: dp.value }));
    return {
      metricId: mid, name: m.name, unit: m.unit, direction: m.direction,
      current, target,
      pct: current != null && target != null ? metricProgressPct(current, target, m.direction) : null,
      trend,
    };
  });

  const linkedHabits: LinkedHabit[] = (ctx.habitsByGoal.get(id) ?? []).map((h) => ({
    id: h.id, title: h.title,
    adherence7: ctx.adherenceByHabit.get(h.id) ?? 0,
    streak: 0,
  }));

  const savings = (ctx.savingsByGoal.get(id) ?? []).map((s) => ({
    ...s, pct: s.target > 0 ? clampPct((s.current / s.target) * 100) : 0,
  }));

  // cross-domain links to/from OTHER goals (funds/supports/blocks/relates-to)
  const crossLinks: CrossLink[] = [];
  for (const l of ctx.linkRows) {
    if (l.fromId === id && l.fromType === "goal") {
      const t = ctx.goalById.get(l.toId);
      if (t) crossLinks.push({ linkId: l.id, relation: l.relation, title: t.title, direction: "out", kind: l.toType });
    } else if (l.toId === id && l.toType === "goal" && l.fromType === "goal") {
      const f = ctx.goalById.get(l.fromId);
      if (f) crossLinks.push({ linkId: l.id, relation: l.relation, title: f.title, direction: "in", kind: l.fromType });
    }
  }

  return {
    id: g.id, title: g.title, description: g.description, domain: g.domain,
    horizon: g.horizon, status: g.status, targetDate: g.targetDate,
    successCriteria: g.successCriteria,
    parent: parentRow ? { id: parentRow.id, title: parentRow.title } : null,
    progress, children, metrics: linkedMetrics, habits: linkedHabits, savings, crossLinks,
  };
}

/** All active goals as flat options (parent pickers, link pickers). */
export async function goalOptions(userId: string): Promise<{ id: string; title: string; horizon: Horizon }[]> {
  const rows = await forUser(userId).select(goals, { where: and(eq(goals.archived, false), eq(goals.status, "active")) });
  return rows
    .sort((a, b) => HORIZONS.indexOf(a.horizon) - HORIZONS.indexOf(b.horizon))
    .map((g) => ({ id: g.id, title: g.title, horizon: g.horizon }));
}

export async function getGoal(userId: string, id: string): Promise<GoalRowDb | null> {
  const [row] = await forUser(userId).select(goals, { where: eq(goals.id, id) });
  return row && !row.archived ? row : null;
}

/** Savings-event → funded goal, for the Finance page's funds→ label. */
export async function savingsFundsGoals(userId: string): Promise<Map<string, { goalId: string; title: string }>> {
  const udb = forUser(userId);
  const [linkRows, goalRows] = await Promise.all([
    udb.select(links, { where: and(eq(links.relation, "funds"), eq(links.fromType, "event"), eq(links.toType, "goal")) }),
    udb.select(goals),
  ]);
  const titleById = new Map(goalRows.map((g) => [g.id, g.title]));
  const out = new Map<string, { goalId: string; title: string }>();
  for (const l of linkRows) {
    const title = titleById.get(l.toId);
    if (title) out.set(l.fromId, { goalId: l.toId, title });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type GoalInput = {
  title: string;
  description: string | null;
  domain: Domain;
  horizon: Horizon;
  parentGoalId: string | null;
  targetDate: string | null;
  successCriteria: string | null;
  status: GoalRowDb["status"];
};

export async function createGoal(userId: string, input: GoalInput): Promise<string> {
  const [row] = await forUser(userId).insert(goals, {
    domain: input.domain,
    title: input.title,
    description: input.description,
    horizon: input.horizon,
    parentGoalId: input.parentGoalId,
    targetDate: input.targetDate,
    successCriteria: input.successCriteria,
    status: input.status,
  });
  return row.id;
}

export async function updateGoal(userId: string, id: string, input: GoalInput): Promise<void> {
  await forUser(userId).update(
    goals,
    {
      domain: input.domain,
      title: input.title,
      description: input.description,
      horizon: input.horizon,
      parentGoalId: input.parentGoalId,
      targetDate: input.targetDate,
      successCriteria: input.successCriteria,
      status: input.status,
    },
    eq(goals.id, id),
  );
}

export async function archiveGoal(userId: string, id: string): Promise<void> {
  await forUser(userId).update(goals, { archived: true }, eq(goals.id, id));
}

/** Attach/detach recurring-action Habits (FR-GOAL.1). */
export async function setHabitGoal(userId: string, habitId: string, goalId: string | null): Promise<void> {
  await forUser(userId).update(habits, { goalId }, eq(habits.id, habitId));
}

/** Link a Metric to a goal for progress (Link metric —relates-to→ goal). */
export async function linkMetricToGoal(userId: string, metricId: string, goalId: string, domain: Domain): Promise<void> {
  const udb = forUser(userId);
  const existing = await udb.select(links, {
    where: and(eq(links.fromId, metricId), eq(links.toId, goalId), eq(links.relation, "relates-to")),
  });
  if (existing.length) return;
  await udb.insert(links, {
    domain, fromId: metricId, fromType: "metric", toId: goalId, toType: "goal", relation: "relates-to",
  });
}

/** Create a cross-domain Link between two goals (FR-GOAL.4). */
export async function createGoalLink(
  userId: string,
  input: { fromId: string; toId: string; relation: "funds" | "supports" | "blocks" | "relates-to"; domain: Domain },
): Promise<void> {
  if (input.fromId === input.toId) return;
  const udb = forUser(userId);
  const existing = await udb.select(links, {
    where: and(eq(links.fromId, input.fromId), eq(links.toId, input.toId), eq(links.relation, input.relation)),
  });
  if (existing.length) return;
  await udb.insert(links, {
    domain: input.domain, fromId: input.fromId, fromType: "goal", toId: input.toId, toType: "goal", relation: input.relation,
  });
}

export async function deleteLink(userId: string, linkId: string): Promise<void> {
  await forUser(userId).delete(links, eq(links.id, linkId));
}

/**
 * Wires a Finance savings goal's funds→ life-goal link (FR-FIN.3 finish):
 * replaces any existing funds link from that savings event.
 */
export async function setSavingsFundsGoal(
  userId: string,
  savingsEventId: string,
  goalId: string | null,
  domain: Domain = "finance",
): Promise<void> {
  if (!savingsEventId) return;
  const udb = forUser(userId);
  await udb.delete(links, and(eq(links.fromId, savingsEventId), eq(links.fromType, "event"), eq(links.relation, "funds")));
  if (goalId) {
    await udb.insert(links, {
      domain, fromId: savingsEventId, fromType: "event", toId: goalId, toType: "goal", relation: "funds",
    });
  }
}

export async function goalMetricOptions(userId: string): Promise<{ id: string; name: string }[]> {
  const rows = await forUser(userId).select(metrics, { where: eq(metrics.archived, false) });
  return rows.map((m) => ({ id: m.id, name: m.name }));
}

export async function goalHabitOptions(userId: string): Promise<{ id: string; title: string; goalId: string | null }[]> {
  const rows = await forUser(userId).select(habits, { where: eq(habits.archived, false) });
  return rows.map((h) => ({ id: h.id, title: h.title, goalId: h.goalId }));
}
