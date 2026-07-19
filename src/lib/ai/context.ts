/**
 * AI context assembler (Phase 4, step 1) — the SOLE source of user data for
 * the LLM API. Everything the model ever sees is assembled HERE, as
 * structured SUMMARIES of what the modules already compute — never raw table
 * rows, never database ids.
 *
 * Privacy boundary (NFR-1):
 * - Raw journal BODY text is excluded by default. Journal contributes only
 *   mood/energy numbers and tags. Including body text requires the caller to
 *   pass an explicit per-feature opt-in (`includeJournalText: true`), which
 *   is OFF by default; `journalTextIncluded` in the output records the
 *   decision so the payload is self-describing.
 * - No entity ids are emitted anywhere — a payload that needs no ids cannot
 *   leak rows wholesale, and the verify suite asserts the absence of UUIDs.
 *
 * This layer READS only (every query via forUser); it has no write
 * capability of any kind.
 */
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { forUser } from "@/db";
import { journalEntries, metricDatapoints, metrics } from "@/db/schema";
import { academicOverview } from "@/lib/data/academic";
import { listEventsInRange } from "@/lib/data/events";
import { budgetVsActual, currentNetWorth, netWorthSeries } from "@/lib/data/finance";
import { goalsByHorizon } from "@/lib/data/goals";
import { listPRs, weeklyAdherence } from "@/lib/data/gym";
import { listHabitsWithStats } from "@/lib/data/habits";
import { listReviews } from "@/lib/data/review";
import { listTasks } from "@/lib/data/tasks";
import { workOverview } from "@/lib/data/work";
import { addDaysISO, toISODate } from "@/lib/dates";

/** Features that may consume context. The journal opt-in is per-feature and
 * must be granted explicitly by that feature's caller — never globally. */
export type AiFeature = "chat" | "weekly-review-draft" | "daily-nudge";

export type AssembleOptions = {
  feature: AiFeature;
  /** NFR-1: raw journal body text. OFF unless explicitly set. */
  includeJournalText?: boolean;
};

// caps — summaries stay summaries even if the data grows
const MAX_GOALS = 25;
const MAX_EVENTS = 30;
const MAX_TOP_TASKS = 10;
const MAX_HABITS = 15;
const MAX_METRICS = 20;
const MAX_WINS = 5;
const MAX_PRS = 6;
const MAX_TAGS = 12;
const TREND_POINTS = 8;

export type AssembledContext = {
  meta: {
    generatedAt: string;
    today: string;
    feature: AiFeature;
    /** records the NFR-1 decision so every payload is self-describing */
    journalTextIncluded: boolean;
  };
  goals: {
    title: string;
    domain: string;
    horizon: string;
    progressPct: number;
    progressBasis: string;
    targetDate: string | null;
  }[];
  upcomingEvents: { title: string; domain: string; kind: string; date: string; time: string | null }[];
  tasks: {
    openCount: number;
    overdueCount: number;
    dueNext7Days: number;
    top: { title: string; due: string | null; priority: number }[];
  };
  habits: {
    adherence7dPct: number;
    items: { title: string; schedule: string; adherence7dPct: number; streak: number }[];
  };
  budget: {
    month: string;
    totalCapAud: number;
    totalSpentAud: number;
    categories: { category: string; capAud: number; spentAud: number }[];
  };
  netWorth: { currentAud: number; monthlyTrendAud: { month: string; value: number }[] };
  metrics: {
    name: string;
    domain: string;
    unit: string | null;
    latest: number | null;
    latestOn: string | null;
    trend: number[];
  }[];
  academic: {
    semester: string | null;
    courses: {
      code: string;
      currentGradePct: number | null;
      targetGradePct: number | null;
      paceFlag: string;
      paceBasis: string;
    }[];
    studyThisWeek: { course: string; plannedHours: number | null; actualHours: number }[];
  };
  work: {
    weekHoursTotal: number;
    projects: {
      title: string;
      deadline: string;
      nextAction: string | null;
      tasksDone: number;
      tasksTotal: number;
      weekHours: number;
    }[];
    recentWins: { date: string; title: string; context: string | null }[];
  };
  gym: {
    thisWeek: { plannedSessions: number; completedSessions: number };
    personalRecords: { lift: string; e1rmKg: number; setOn: string }[];
  };
  journal: {
    daysWithEntryLast7: number;
    avgMood: number | null;
    avgEnergy: number | null;
    recentTags: string[];
    /** present ONLY under the explicit per-feature opt-in (NFR-1) */
    entriesLast7?: { date: string; text: string }[];
  };
  reviews: { lastCompleted: { type: string; period: string; savedOn: string } | null };
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

async function metricSummaries(userId: string): Promise<AssembledContext["metrics"]> {
  const udb = forUser(userId);
  const rows = await udb.select(metrics, { where: eq(metrics.archived, false) });
  if (rows.length === 0) return [];
  const points = await udb.select(metricDatapoints, {
    where: inArray(metricDatapoints.metricId, rows.map((m) => m.id)),
    orderBy: [metricDatapoints.timestamp],
  });
  const byMetric = new Map<string, { value: number; ts: Date }[]>();
  for (const p of points) {
    (byMetric.get(p.metricId) ?? byMetric.set(p.metricId, []).get(p.metricId)!).push({
      value: p.value,
      ts: p.timestamp,
    });
  }
  return rows
    .map((m) => {
      const series = byMetric.get(m.id) ?? [];
      const last = series[series.length - 1];
      return {
        name: m.name,
        domain: m.domain,
        unit: m.unit,
        latest: last ? round1(last.value) : null,
        latestOn: last ? toISODate(last.ts) : null,
        trend: series.slice(-TREND_POINTS).map((p) => round1(p.value)),
      };
    })
    .filter((m) => m.latest != null)
    .sort((a, b) => (b.latestOn ?? "").localeCompare(a.latestOn ?? ""))
    .slice(0, MAX_METRICS);
}

export async function assembleContext(
  userId: string,
  opts: AssembleOptions,
): Promise<AssembledContext> {
  const includeJournalText = opts.includeJournalText === true; // explicit opt-in only
  const today = toISODate(new Date());
  const weekAgo = addDaysISO(today, -6);

  const [
    goalGroups, events, taskList, habitStats, budget, netWorthNow, nwSeries,
    metricList, acad, work, gymWeeks, prs, journal, reviews,
  ] = await Promise.all([
    goalsByHorizon(userId),
    listEventsInRange(userId, today, addDaysISO(today, 14)),
    listTasks(userId),
    listHabitsWithStats(userId, today),
    budgetVsActual(userId),
    currentNetWorth(userId),
    netWorthSeries(userId, 6),
    metricSummaries(userId),
    academicOverview(userId),
    workOverview(userId),
    weeklyAdherence(userId, 1),
    listPRs(userId),
    forUser(userId).select(journalEntries, {
      where: and(
        eq(journalEntries.archived, false),
        gte(journalEntries.date, weekAgo),
        lt(journalEntries.date, addDaysISO(today, 1)),
      ),
    }),
    listReviews(userId),
  ]);

  const open = taskList.filter((t) => t.status === "open");
  const moods = journal.map((j) => j.mood).filter((m): m is number => m != null);
  const energies = journal.map((j) => j.energy).filter((e): e is number => e != null);
  const gymWeek = gymWeeks[gymWeeks.length - 1] ?? { planned: 0, completed: 0 };
  const lastReview = reviews[0] ?? null;

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      today,
      feature: opts.feature,
      journalTextIncluded: includeJournalText,
    },
    goals: goalGroups
      .flatMap((g) => g.goals)
      .slice(0, MAX_GOALS)
      .map((g) => ({
        title: g.title,
        domain: g.domain,
        horizon: g.horizon,
        progressPct: g.pct,
        progressBasis: g.basis,
        targetDate: g.targetDate,
      })),
    upcomingEvents: events.slice(0, MAX_EVENTS).map((e) => ({
      title: e.title,
      domain: e.domain,
      kind: e.kind,
      date: e.dateISO,
      time: e.timeHM,
    })),
    tasks: {
      openCount: open.length,
      overdueCount: open.filter((t) => t.dueDate != null && t.dueDate < today).length,
      dueNext7Days: open.filter(
        (t) => t.dueDate != null && t.dueDate >= today && t.dueDate <= addDaysISO(today, 7),
      ).length,
      top: open
        .filter((t) => t.dueDate != null)
        .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "") || a.priority - b.priority)
        .slice(0, MAX_TOP_TASKS)
        .map((t) => ({ title: t.title, due: t.dueDate, priority: t.priority })),
    },
    habits: {
      adherence7dPct: habitStats.adherence7,
      items: habitStats.habits.slice(0, MAX_HABITS).map((h) => ({
        title: h.title,
        schedule: h.scheduleLabel,
        adherence7dPct: h.adherence7,
        streak: h.streak,
      })),
    },
    budget: {
      month: `${today.slice(0, 7)}`,
      totalCapAud: budget.cap,
      totalSpentAud: budget.spent,
      categories: budget.rows.map((r) => ({
        category: r.category,
        capAud: r.cap,
        spentAud: r.spent,
      })),
    },
    netWorth: {
      currentAud: netWorthNow,
      monthlyTrendAud: nwSeries.map((p) => ({ month: p.monthKey, value: p.value })),
    },
    metrics: metricList,
    academic: {
      semester: acad.semesterLabel,
      courses: acad.courses.map((c) => ({
        code: c.code,
        currentGradePct: c.currentGrade,
        targetGradePct: c.targetGrade,
        paceFlag: c.pace.label,
        paceBasis: c.pace.basis,
      })),
      studyThisWeek: acad.study.map((s) => ({
        course: s.code,
        plannedHours: s.planned,
        actualHours: s.actual,
      })),
    },
    work: {
      weekHoursTotal: work.weekTotal.hours,
      projects: work.projects.map((p) => ({
        title: p.title,
        deadline: p.dueISO,
        nextAction: p.next?.title ?? null,
        tasksDone: p.tasksDone,
        tasksTotal: p.tasksTotal,
        weekHours: p.weekHours,
      })),
      recentWins: work.achievements.slice(0, MAX_WINS).map((a) => ({
        date: a.dateISO,
        title: a.title,
        context: a.context,
      })),
    },
    gym: {
      thisWeek: { plannedSessions: gymWeek.planned, completedSessions: gymWeek.completed },
      personalRecords: prs.slice(0, MAX_PRS).map((p) => ({
        lift: p.lift,
        e1rmKg: p.e1rm,
        setOn: p.whenISO,
      })),
    },
    journal: {
      daysWithEntryLast7: new Set(journal.map((j) => j.date)).size,
      avgMood: moods.length ? round1(moods.reduce((s, m) => s + m, 0) / moods.length) : null,
      avgEnergy: energies.length
        ? round1(energies.reduce((s, e) => s + e, 0) / energies.length)
        : null,
      recentTags: [...new Set(journal.flatMap((j) => j.tags))].slice(0, MAX_TAGS),
      // NFR-1: body text ONLY under the explicit per-feature opt-in
      ...(includeJournalText
        ? {
            entriesLast7: journal
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((j) => ({ date: j.date, text: j.body })),
          }
        : {}),
    },
    reviews: {
      lastCompleted: lastReview
        ? {
            type: lastReview.payload.rev,
            period: lastReview.payload.periodLabel,
            savedOn: lastReview.payload.savedISO,
          }
        : null,
    },
  };
}
