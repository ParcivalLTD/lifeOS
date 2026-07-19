/**
 * DTO contracts for the co-mounted tab track. Everything here must be
 * JSON-serializable (crosses the server-action / RSC-prop boundary).
 * Fetching lives in lib/data/tab-data-server.ts; these types are shared by
 * the server fetchers and the client views.
 */
import type { AcademicOverview } from "./data/academic";
import type { GoalsReview, StoredReview, WeeklySummary } from "./data/review";
import type { WorkOverview } from "./data/work";
import type { EventItem } from "./event-utils";
import type { TaskItem } from "./task-utils";
import type { HabitItem } from "./data/habits";
import type { GoalListItem } from "./data/goals";
import type {
  AdherenceWeek,
  GymSession,
  GymTemplate,
  GymWeekDay,
  LiftPoint,
  PR,
} from "./data/gym";
import type {
  Account,
  Bill,
  BudgetActual,
  Expense,
  NetWorthPoint,
  SavingsGoal,
} from "./data/finance";
import type { Horizon } from "./goals";

export type TrackTabKey =
  | "today"
  | "goals"
  | "tasks"
  | "habits"
  | "calendar"
  | "academic"
  | "work"
  | "gym"
  | "finance"
  | "review";

export const TRACK_TABS: { key: TrackTabKey; href: string; title: string }[] = [
  { key: "today", href: "/", title: "LIFEOS — TODAY" },
  { key: "goals", href: "/goals", title: "LIFEOS — GOALS" },
  { key: "tasks", href: "/tasks", title: "LIFEOS — TASKS" },
  { key: "habits", href: "/habits", title: "LIFEOS — HABITS" },
  { key: "calendar", href: "/calendar", title: "LIFEOS — CALENDAR" },
  { key: "academic", href: "/academic", title: "LIFEOS — ACADEMIC" },
  { key: "work", href: "/work", title: "LIFEOS — WORK" },
  { key: "gym", href: "/gym", title: "LIFEOS — GYM" },
  { key: "finance", href: "/finance", title: "LIFEOS — FINANCE" },
  { key: "review", href: "/review", title: "LIFEOS — REVIEW" },
];

export const trackIndex = (key: TrackTabKey): number =>
  TRACK_TABS.findIndex((t) => t.key === key);

// --- per-tab DTOs --------------------------------------------------------------

export type TodayData = {
  todayISO: string;
  nowHM: string;
  events: EventItem[];
  topTasks: TaskItem[];
  openCount: number;
  habits: HabitItem[];
  adherence7: number;
  goals: GoalListItem[];
  activeGoalCount: number;
  budgetRows: BudgetActual[];
  budgetSpent: number;
  budgetCap: number;
  monthKey: string;
  gymSession: GymSession | null;
  gymWeek: GymWeekDay[];
  /** today's cached daily nudge (FR-AI.3); null until generated. The build
   * NEVER calls the API — the banner generates client-side on first load. */
  nudge: string | null;
  nudgeEnabled: boolean;
  nudgeConfigured: boolean;
};

export type GoalsData = {
  groups: { horizon: Horizon; label: string; goals: GoalListItem[] }[];
};

export type TasksData = { tasks: TaskItem[]; todayISO: string };

export type HabitsData = { habits: HabitItem[]; adherence7: number };

export type CalendarData = {
  view: "month" | "week" | "day";
  date: string;
  todayISO: string;
  events: EventItem[];
};

export type GymData = {
  todayISO: string;
  templates: GymTemplate[];
  sessions: GymSession[];
  prs: PR[];
  weeks: AdherenceWeek[];
  weekDays: GymWeekDay[];
  activeSessionId: string | null;
  /** deep-linked ?lift= selection, validated server-side (null = first PR lift). */
  chartLift: string | null;
  lastByExercise: Record<string, string | null>;
  seriesByLift: Record<string, LiftPoint[]>;
};

export type FinanceData = {
  monthKey: string;
  todayISO: string;
  accounts: Account[];
  savings: SavingsGoal[];
  expenses: Expense[];
  budgetRows: BudgetActual[];
  budgetSpent: number;
  budgetCap: number;
  categories: string[];
  series: NetWorthPoint[];
  netWorth: number;
  delta: number;
  bills: Bill[];
  /** savings event id → funded goal (Map flattened for serialization). */
  fundsGoals: Record<string, { goalId: string; title: string }>;
};

export type AcademicData = AcademicOverview & {
  /** academic-domain active goals via the goal engine (FR-ACAD.1 — reused,
   * not rebuilt), horizon order preserved */
  goals: GoalListItem[];
};

export type WorkData = WorkOverview & {
  /** work-domain active goals via the goal engine (FR-WORK.1 — reused, not
   * rebuilt), horizon order preserved */
  goals: GoalListItem[];
};

export type ReviewData = {
  todayISO: string;
  weekly: WeeklySummary;
  goalsReview: GoalsReview;
  monthly: { key: string; label: string };
  quarterly: { key: string; label: string };
  /** stored snapshots, newest period first (FR-REV.3) */
  timeline: StoredReview[];
};

export type TabDataMap = {
  today: TodayData;
  goals: GoalsData;
  tasks: TasksData;
  habits: HabitsData;
  calendar: CalendarData;
  academic: AcademicData;
  work: WorkData;
  gym: GymData;
  finance: FinanceData;
  review: ReviewData;
};

export type AnyTabData = TabDataMap[TrackTabKey];

/** Params a deep link can contribute to its tab's initial data. */
export type TabParams = {
  view?: string;
  date?: string;
  session?: string;
  lift?: string;
};
