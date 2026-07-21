/**
 * Server-side DTO builders for the co-mounted tab track. One function per
 * tab, all through the forUser-scoped data layer (RLS rule intact — only the
 * transport to the client changed, not the data access).
 */
import { isCalendarView, viewRange, type CalendarView } from "@/lib/calendar";
import { aiConfigured } from "@/lib/ai/client";
import { academicOverview } from "@/lib/data/academic";
import { listEventsInRange } from "@/lib/data/events";
import { getNudgeEnabled, getTodayNudge } from "@/lib/data/nudge";
import { goalsReview, listReviews, weeklySummary } from "@/lib/data/review";
import { workOverview } from "@/lib/data/work";
import { monthlyPeriod, quarterlyPeriod } from "@/lib/review";
import {
  computeBudgetVsActual,
  currentNetWorth,
  listAccounts,
  listBills,
  listBudgets,
  listExpenses,
  listSavings,
  netWorthSeries,
} from "@/lib/data/finance";
import { goalsByHorizon, savingsFundsGoals, topActiveGoals } from "@/lib/data/goals";
import { healthOverview } from "@/lib/data/health";
import {
  getSession,
  liftSeries,
  listPRs,
  listSessions,
  listTemplates,
  previousSession,
  thisWeekDays,
  weeklyAdherence,
} from "@/lib/data/gym";
import { listHabitsWithStats } from "@/lib/data/habits";
import { listTasks } from "@/lib/data/tasks";
import { addDaysISO, isValidISODate, todayISO } from "@/lib/dates";
import { currentMonthKey, netWorthDeltaFrom } from "@/lib/finance";
import { lastSetsSummary } from "@/lib/gym";
import type {
  AcademicData,
  AnyTabData,
  CalendarData,
  FinanceData,
  GoalsData,
  GymData,
  HabitsData,
  HealthData,
  TabDataKey,
  TabDataMap,
  TabParams,
  ReviewData,
  TasksData,
  TodayData,
  TrackViewKey,
  WorkData,
} from "@/lib/tab-data";
import { tabForView, trackIndex, TRACK_TABS as ORDER } from "@/lib/tab-data";

export async function buildTodayData(userId: string): Promise<TodayData> {
  const today = todayISO();
  const month = currentMonthKey();
  const [tasks, habitsOverview, events, goalsTop, budgets, expenses, sessions, gymWeek, nudge, nudgeEnabled] =
    await Promise.all([
      listTasks(userId),
      listHabitsWithStats(userId, today),
      listEventsInRange(userId, today, addDaysISO(today, 1)),
      topActiveGoals(userId, 4),
      listBudgets(userId),
      listExpenses(userId, { monthKey: month }),
      listSessions(userId, 5),
      thisWeekDays(userId),
      getTodayNudge(userId), // cached read only — no API call on dashboard load
      getNudgeEnabled(userId),
    ]);
  const bva = computeBudgetVsActual(budgets, expenses);
  const open = tasks.filter((t) => t.status === "open");
  const now = new Date();
  return {
    todayISO: today,
    nowHM: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    events,
    topTasks: open.slice(0, 3),
    openCount: open.length,
    habits: habitsOverview.habits.filter((h) => h.scheduledToday),
    adherence7: habitsOverview.adherence7,
    goals: goalsTop.goals,
    activeGoalCount: goalsTop.activeCount,
    budgetRows: bva.rows,
    budgetSpent: bva.spent,
    budgetCap: bva.cap,
    monthKey: month,
    gymSession: sessions.find((s) => s.dateISO === today) ?? null,
    gymWeek,
    nudge: nudge?.text ?? null,
    nudgeEnabled,
    nudgeConfigured: aiConfigured(),
  };
}

export async function buildGoalsData(userId: string): Promise<GoalsData> {
  const groups = await goalsByHorizon(userId);
  return { groups };
}

export async function buildTasksData(userId: string): Promise<TasksData> {
  return { tasks: await listTasks(userId), todayISO: todayISO() };
}

export async function buildHabitsData(userId: string): Promise<HabitsData> {
  const overview = await listHabitsWithStats(userId, todayISO());
  return { habits: overview.habits, adherence7: overview.adherence7 };
}

export async function buildCalendarData(
  userId: string,
  params: TabParams = {},
): Promise<CalendarData> {
  const today = todayISO();
  const view: CalendarView =
    params.view && isCalendarView(params.view) ? params.view : "week";
  const date = params.date && isValidISODate(params.date) ? params.date : today;
  const { from, to } = viewRange(view, date);
  const events = await listEventsInRange(userId, from, to);
  return { view, date, todayISO: today, events };
}

export async function buildAcademicData(userId: string): Promise<AcademicData> {
  const [overview, groups] = await Promise.all([
    academicOverview(userId),
    goalsByHorizon(userId),
  ]);
  return {
    ...overview,
    goals: groups.flatMap((g) => g.goals).filter((g) => g.domain === "academic"),
  };
}

export async function buildWorkData(userId: string): Promise<WorkData> {
  const [overview, groups] = await Promise.all([
    workOverview(userId),
    goalsByHorizon(userId),
  ]);
  return {
    ...overview,
    goals: groups.flatMap((g) => g.goals).filter((g) => g.domain === "work"),
  };
}

export async function buildReviewData(userId: string): Promise<ReviewData> {
  const today = todayISO();
  const [weekly, goals, timeline] = await Promise.all([
    weeklySummary(userId),
    goalsReview(userId),
    listReviews(userId),
  ]);
  return {
    todayISO: today,
    weekly,
    goalsReview: goals,
    monthly: monthlyPeriod(today),
    quarterly: quarterlyPeriod(today),
    timeline,
  };
}

export async function buildGymData(
  userId: string,
  params: TabParams = {},
): Promise<GymData> {
  const today = todayISO();
  const [templates, sessions, prs, weeks, weekDays] = await Promise.all([
    listTemplates(userId),
    listSessions(userId, 12),
    listPRs(userId),
    weeklyAdherence(userId, 8),
    thisWeekDays(userId),
  ]);

  let active = params.session ? await getSession(userId, params.session) : null;
  if (!active || active.isEnded) {
    active = sessions.find((s) => !s.isEnded) ?? null;
  }

  const lifts = prs.map((p) => p.lift);
  const [prev, ...seriesList] = await Promise.all([
    active ? previousSession(userId, active) : Promise.resolve(null),
    ...lifts.map((l) => liftSeries(userId, l, 8)),
  ]);

  const seriesByLift: Record<string, (typeof seriesList)[number]> = {};
  lifts.forEach((l, i) => (seriesByLift[l] = seriesList[i]));

  const lastByExercise: Record<string, string | null> = {};
  if (active && prev) {
    for (const ex of active.exercises) {
      const p = prev.exercises.find((e) => e.name === ex.name);
      lastByExercise[ex.name] = p ? lastSetsSummary(p.sets) : null;
    }
  }

  return {
    todayISO: today,
    templates,
    sessions,
    prs,
    weeks,
    weekDays,
    activeSessionId: active?.id ?? null,
    chartLift: params.lift && lifts.includes(params.lift) ? params.lift : null,
    lastByExercise,
    seriesByLift,
    view: params.view === "stats" ? "stats" : "templates",
  };
}

export async function buildHealthData(userId: string): Promise<HealthData> {
  return healthOverview(userId);
}

export async function buildFinanceData(userId: string): Promise<FinanceData> {
  const month = currentMonthKey();
  const [accounts, savings, expenses, budgets, series, nw, bills, funds] =
    await Promise.all([
      listAccounts(userId),
      listSavings(userId),
      listExpenses(userId, { monthKey: month }),
      listBudgets(userId),
      netWorthSeries(userId, 7),
      currentNetWorth(userId),
      listBills(userId),
      savingsFundsGoals(userId),
    ]);
  const bva = computeBudgetVsActual(budgets, expenses);
  return {
    monthKey: month,
    todayISO: todayISO(),
    accounts,
    savings,
    expenses,
    budgetRows: bva.rows,
    budgetSpent: bva.spent,
    budgetCap: bva.cap,
    categories: [
      ...new Set([
        ...bva.rows.map((b) => b.category),
        "Groceries", "Eating out", "Transport", "Subscriptions", "Other",
      ]),
    ],
    series,
    netWorth: nw,
    delta: netWorthDeltaFrom(series, nw),
    bills,
    fundsGoals: Object.fromEntries(funds),
  };
}

const BUILDERS: {
  [K in TabDataKey]: (userId: string, params?: TabParams) => Promise<TabDataMap[K]>;
} = {
  today: buildTodayData,
  goals: buildGoalsData,
  tasks: buildTasksData,
  habits: buildHabitsData,
  calendar: buildCalendarData,
  academic: buildAcademicData,
  work: buildWorkData,
  gym: buildGymData,
  health: buildHealthData,
  finance: buildFinanceData,
  review: buildReviewData,
};

export function buildTabData(
  userId: string,
  tab: TabDataKey,
  params?: TabParams,
): Promise<AnyTabData> {
  return BUILDERS[tab](userId, params);
}

/**
 * The landing view's tab plus both neighbouring tabs, every segment of each,
 * fetched in parallel (the initial trio). A tab with a segmented control
 * brings BOTH its views so flipping the segment — like swiping — never lands
 * on a skeleton.
 */
export async function buildInitialTrio(
  userId: string,
  view: TrackViewKey,
  params?: TabParams,
): Promise<Partial<TabDataMap>> {
  const idx = trackIndex(tabForView(view).key);
  const keys = [ORDER[idx - 1], ORDER[idx], ORDER[idx + 1]]
    .filter(Boolean)
    .flatMap((t) => t.views.map((v) => v.key));
  const results = await Promise.all(
    keys.map((k) => buildTabData(userId, k, k === view ? params : undefined)),
  );
  const out: Record<string, AnyTabData> = {};
  keys.forEach((k, i) => (out[k] = results[i]));
  return out as Partial<TabDataMap>;
}
