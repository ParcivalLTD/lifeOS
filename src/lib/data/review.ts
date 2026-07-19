/**
 * Review system data layer (spec §8.10) — the smart layer over every module,
 * not a new data type:
 *
 * - The weekly summary and goal review are COMPUTED live from the other
 *   modules' own computations (task lists, habit adherence, gym adherence,
 *   budget vs actual, study hours, work hours/wins, journal, goal engine,
 *   academic pace). Every figure carries a `basis` string (FR-REV.1).
 * - **Saved reviews are Events** (`domain=personal`, `kind=other`,
 *   `payload.rev = {…}`) storing the point-in-time snapshot + reflections —
 *   `calendarVisible` excludes the `rev` key. One review per (type, period):
 *   saving again replaces the snapshot (FR-REV.3 timeline stays one row per
 *   period).
 *
 * All queries go through forUser (RLS-bypass rule).
 */
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { forUser } from "@/db";
import { events, journalEntries, metricDatapoints, metrics } from "@/db/schema";
import { academicOverview } from "@/lib/data/academic";
import { budgetVsActual, listExpenses } from "@/lib/data/finance";
import { goalsByHorizon, type GoalListItem } from "@/lib/data/goals";
import { listPRs, weeklyAdherence } from "@/lib/data/gym";
import { listHabitsWithStats } from "@/lib/data/habits";
import { listTasks } from "@/lib/data/tasks";
import { workOverview } from "@/lib/data/work";
import { addDaysISO, parseISODate, toISODate } from "@/lib/dates";
import { round2 } from "@/lib/work";
import {
  monthlyPeriod,
  quarterlyPeriod,
  weeklyPeriod,
  type GoalSnapshot,
  type ReviewPayload,
  type ReviewStat,
  type ReviewType,
} from "@/lib/review";

const revIs = sql`${events.payload} is not null and jsonb_exists(${events.payload}, 'rev')`;

export type StoredReview = { id: string; dateISO: string; payload: ReviewPayload };

export type WeeklySummary = {
  periodKey: string;
  periodLabel: string;
  stats: ReviewStat[];
  highlights: string[];
};

export type GoalsReview = { goals: GoalSnapshot[] };

const inWeek = (iso: string | null, fromISO: string, toISO: string): boolean =>
  iso != null && iso >= fromISO && iso <= toISO;

// --- FR-REV.1: the auto-generated weekly summary --------------------------------

export async function weeklySummary(userId: string): Promise<WeeklySummary> {
  const today = toISODate(new Date());
  const period = weeklyPeriod(today);
  const { fromISO, toISO } = period;
  const lastFrom = addDaysISO(fromISO, -7);

  const [tasks, habits, gymWeeks, expenses, budget, acad, work, prs, journal, sleepPoints] =
    await Promise.all([
      listTasks(userId),
      listHabitsWithStats(userId, today),
      weeklyAdherence(userId, 1),
      listExpenses(userId),
      budgetVsActual(userId),
      academicOverview(userId),
      workOverview(userId),
      listPRs(userId),
      forUser(userId).select(journalEntries, {
        where: and(
          eq(journalEntries.archived, false),
          gte(journalEntries.date, fromISO),
          lt(journalEntries.date, addDaysISO(toISO, 1)),
        ),
      }),
      sleepThisWeek(userId, fromISO, toISO),
    ]);

  // tasks due this week (tasks without a due date can't be attributed to a week)
  const due = tasks.filter((t) => t.status !== "dropped" && inWeek(t.dueDate, fromISO, toISO));
  const doneDue = due.filter((t) => t.status === "done");

  const gym = gymWeeks[gymWeeks.length - 1] ?? { planned: 0, completed: 0 };

  const spendThis = round2(
    expenses.filter((e) => inWeek(e.dateISO, fromISO, toISO)).reduce((s, e) => s + e.amount, 0),
  );
  const spendLast = round2(
    expenses
      .filter((e) => inWeek(e.dateISO, lastFrom, addDaysISO(fromISO, -1)))
      .reduce((s, e) => s + e.amount, 0),
  );
  const spendDelta =
    spendLast > 0 ? `${spendThis >= spendLast ? "+" : "−"}${Math.abs(Math.round(((spendThis - spendLast) / spendLast) * 100))}%` : null;

  const studyActual = round2(acad.study.reduce((s, r) => s + r.actual, 0));
  const studyPlanned = round2(acad.study.reduce((s, r) => s + (r.planned ?? 0), 0));

  const journalDays = new Set(journal.map((j) => j.date)).size;
  const moods = journal.map((j) => j.mood).filter((m): m is number => m != null);
  const avgMood = moods.length ? (moods.reduce((s, m) => s + m, 0) / moods.length).toFixed(1) : null;
  const avgSleep = sleepPoints.length
    ? `${(sleepPoints.reduce((s, p) => s + p, 0) / sleepPoints.length).toFixed(1)} H`
    : null;

  const stats: ReviewStat[] = [
    {
      v: `${doneDue.length}/${due.length}`,
      l: "tasks done",
      basis: "TASKS DUE THIS WEEK (UNDATED TASKS EXCLUDED)",
    },
    {
      v: `${habits.adherence7}%`,
      l: "habit adherence",
      basis: "SCHEDULED HABIT-DAYS COMPLETED, LAST 7 DAYS",
    },
    {
      v: `${gym.completed}/${gym.planned}`,
      l: "workouts",
      basis: "LOGGED VS PLANNED GYM SESSIONS THIS WEEK",
    },
    {
      v: `A$${spendThis}${spendDelta ? ` · ${spendDelta}` : ""}`,
      l: "spend vs last wk",
      basis: spendDelta
        ? "LOGGED EXPENSES THIS WEEK VS LAST WEEK"
        : "LOGGED EXPENSES THIS WEEK — NO PRIOR-WEEK DATA TO COMPARE",
    },
    {
      v: `${studyActual}/${studyPlanned} H`,
      l: "study hours",
      basis: "LOGGED STUDY SESSIONS VS COURSE WEEKLY PLANS",
    },
    {
      v: `${work.weekTotal.hours} H`,
      l: "work tracked",
      basis: "TIME ENTRIES ACROSS PROJECTS THIS WEEK",
    },
    {
      v: `${journalDays}/7`,
      l: "journal days",
      basis: "DAYS THIS WEEK WITH A JOURNAL ENTRY",
    },
    {
      v: avgMood ?? "—",
      l: "avg mood",
      basis: avgMood ? "MEAN MOOD (1–5) FROM THIS WEEK'S JOURNAL CHECK-INS" : "NO MOOD CHECK-INS THIS WEEK",
    },
    {
      v: avgSleep ?? "—",
      l: "avg sleep",
      basis: avgSleep ? "MEAN OF SLEEP-HOURS DATAPOINTS THIS WEEK" : "NO SLEEP DATA LOGGED THIS WEEK",
    },
  ];

  // highlights: each one traceable to a record, never invented
  const highlights: string[] = [];
  for (const pr of prs) {
    if (inWeek(pr.whenISO, fromISO, toISO)) highlights.push(`PR — ${pr.lift} e1RM ${pr.e1rm} kg`);
  }
  for (const a of work.achievements) {
    if (inWeek(a.dateISO, fromISO, toISO)) highlights.push(`Win — ${a.title}`);
  }
  for (const c of acad.courses) {
    if (c.pace.flag === "at-risk" || c.pace.flag === "tight") {
      highlights.push(`${c.code} ${c.pace.label}: ${c.pace.basis}`);
    }
  }
  for (const b of budget.rows) {
    if (b.cap > 0 && b.spent > b.cap) {
      highlights.push(`${b.category} over monthly cap — A$${b.spent} of A$${b.cap}`);
    }
  }
  if (highlights.length === 0) highlights.push("No notable signals this week");

  return { periodKey: period.key, periodLabel: period.label, stats, highlights };
}

async function sleepThisWeek(userId: string, fromISO: string, toISO: string): Promise<number[]> {
  const udb = forUser(userId);
  const [metric] = await udb.select(metrics, {
    where: and(eq(metrics.domain, "health"), eq(metrics.name, "Sleep hours")),
  });
  if (!metric) return [];
  const points = await udb.select(metricDatapoints, {
    where: and(
      eq(metricDatapoints.metricId, metric.id),
      gte(metricDatapoints.timestamp, parseISODate(fromISO)),
      lt(metricDatapoints.timestamp, parseISODate(addDaysISO(toISO, 1))),
    ),
  });
  return points.map((p) => p.value);
}

// --- FR-REV.2: goal review with at-risk flags -------------------------------------

function flagGoal(
  g: GoalListItem,
  todayISO: string,
  academicPace: Map<string, { label: string; basis: string; bad: boolean }>,
): Pick<GoalSnapshot, "flag" | "flagBasis"> {
  const pace = academicPace.get(g.id);
  if (pace?.bad) return { flag: "at-risk", flagBasis: `ACADEMIC PACE — ${pace.basis}` };
  if (g.targetDate && g.targetDate < todayISO && g.pct < 100) {
    return { flag: "overdue", flagBasis: `TARGET DATE ${g.targetDate} PASSED AT ${g.pct}%` };
  }
  if (g.basis === "none") {
    return { flag: "no-signal", flagBasis: "NO LINKED METRIC, HABITS, MILESTONES OR SAVINGS — PROGRESS UNKNOWN" };
  }
  return { flag: "on-track", flagBasis: `${g.pct}% VIA ${g.basis.toUpperCase()}` };
}

export async function goalsReview(userId: string): Promise<GoalsReview> {
  const today = toISODate(new Date());
  const [groups, acad] = await Promise.all([goalsByHorizon(userId), academicOverview(userId)]);

  // course pace flags keyed by the course's linked goal (FR-REV.2 at-risk)
  const paceByGoal = new Map<string, { label: string; basis: string; bad: boolean }>();
  for (const c of acad.courses) {
    if (c.goalId) {
      paceByGoal.set(c.goalId, {
        label: c.pace.label,
        basis: c.pace.basis,
        bad: c.pace.flag === "at-risk" || c.pace.flag === "tight",
      });
    }
  }

  const goals: GoalSnapshot[] = groups
    .flatMap((grp) => grp.goals)
    .map((g) => ({
      id: g.id,
      title: g.title,
      domain: g.domain,
      horizon: g.horizon,
      pct: g.pct,
      basis: g.basis,
      ...flagGoal(g, today, paceByGoal),
    }));
  return { goals };
}

// --- FR-REV.3: stored reviews, one per (type, period) ------------------------------

const toStored = (row: typeof events.$inferSelect): StoredReview => ({
  id: row.id,
  dateISO: toISODate(row.start),
  payload: row.payload as ReviewPayload,
});

export async function listReviews(userId: string): Promise<StoredReview[]> {
  const rows = await forUser(userId).select(events, {
    where: and(eq(events.archived, false), revIs),
    orderBy: [desc(events.start), desc(events.createdAt)],
  });
  return rows
    .map(toStored)
    .sort((a, b) => b.payload.periodKey.localeCompare(a.payload.periodKey));
}

export async function getReview(userId: string, id: string): Promise<StoredReview | null> {
  const [row] = await forUser(userId).select(events, { where: and(eq(events.id, id), revIs) });
  return row && !row.archived ? toStored(row) : null;
}

/**
 * Saves a review snapshot; a second save for the same (type, periodKey)
 * REPLACES the stored snapshot + reflections (re-reviewing a period edits it,
 * the timeline never grows duplicates).
 */
export async function saveReview(
  userId: string,
  type: ReviewType,
  reflections: Record<string, string>,
): Promise<string> {
  const today = toISODate(new Date());
  const udb = forUser(userId);

  let payload: ReviewPayload;
  let title: string;
  if (type === "weekly") {
    const summary = await weeklySummary(userId);
    payload = {
      rev: "weekly",
      periodKey: summary.periodKey,
      periodLabel: summary.periodLabel,
      savedISO: today,
      stats: summary.stats,
      highlights: summary.highlights,
      reflections,
    };
    title = `Weekly review — ${summary.periodLabel}`;
  } else {
    const period = type === "monthly" ? monthlyPeriod(today) : quarterlyPeriod(today);
    const { goals } = await goalsReview(userId);
    payload = {
      rev: type,
      periodKey: period.key,
      periodLabel: period.label,
      savedISO: today,
      reflections,
      goals,
    };
    title = `${type === "monthly" ? "Monthly" : "Quarterly"} review — ${period.label}`;
  }

  const existing = (await listReviews(userId)).find(
    (r) => r.payload.rev === type && r.payload.periodKey === payload.periodKey,
  );
  if (existing) {
    await udb.update(
      events,
      { title, start: parseISODate(today), payload },
      eq(events.id, existing.id),
    );
    return existing.id;
  }
  const [row] = await udb.insert(events, {
    domain: "personal",
    kind: "other",
    title,
    start: parseISODate(today),
    allDay: true,
    payload,
  });
  return row.id;
}

export async function archiveReview(userId: string, id: string): Promise<void> {
  await forUser(userId).update(events, { archived: true }, and(eq(events.id, id), revIs));
}
