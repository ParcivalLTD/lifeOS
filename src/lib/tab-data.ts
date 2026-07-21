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
import type { HealthOverview } from "./data/health";
import type { Horizon } from "./goals";

/** Every DTO the tab layer can build. Two of them — goals and review — are
 * NOT on the swipe track: goals is reachable from the dashboard card and its
 * own route, review lives under the Assistant tab's Reviews segment. */
export type TabDataKey =
  | "today"
  | "goals"
  | "tasks"
  | "habits"
  | "calendar"
  | "academic"
  | "work"
  | "gym"
  | "health"
  | "finance"
  | "review";

/** The six co-mounted, swipeable tabs of the primary nav. */
export type TrackTabKey =
  | "today"
  | "daily"
  | "calendar"
  | "acadwork"
  | "gym"
  | "finance";

/** A DTO reachable inside the track — i.e. a segment of some track tab. */
export type TrackViewKey = Exclude<TabDataKey, "goals" | "review">;

/** One segment of a track tab: its own route, title and DTO. Tabs with a
 * single view have no segmented control; tabs with two render one at the top
 * of the page and keep the two views' filters and forms entirely separate. */
export type TrackView = {
  key: TrackViewKey;
  href: string;
  label: string;
  title: string;
};

export type TrackTab = {
  key: TrackTabKey;
  /** container width the views use, so the segmented bar lines up with them */
  width: 720 | 1280;
  views: TrackView[];
};

export const TRACK_TABS: TrackTab[] = [
  {
    key: "today",
    width: 1280,
    views: [{ key: "today", href: "/", label: "Today", title: "HELM — TODAY" }],
  },
  {
    key: "daily",
    width: 720,
    views: [
      { key: "tasks", href: "/tasks", label: "Tasks", title: "HELM — TASKS" },
      { key: "habits", href: "/habits", label: "Habits", title: "HELM — HABITS" },
    ],
  },
  {
    key: "calendar",
    width: 1280,
    views: [
      { key: "calendar", href: "/calendar", label: "Calendar", title: "HELM — CALENDAR" },
    ],
  },
  {
    key: "acadwork",
    width: 1280,
    views: [
      { key: "academic", href: "/academic", label: "Academic", title: "HELM — ACADEMIC" },
      { key: "work", href: "/work", label: "Work", title: "HELM — WORK" },
    ],
  },
  {
    key: "gym",
    width: 1280,
    views: [
      { key: "health", href: "/health", label: "Health", title: "HELM — HEALTH" },
      { key: "gym", href: "/gym", label: "Gym", title: "HELM — GYM" },
    ],
  },
  {
    key: "finance",
    width: 1280,
    views: [{ key: "finance", href: "/finance", label: "Finance", title: "HELM — FINANCE" }],
  },
];

export const trackIndex = (key: TrackTabKey): number =>
  TRACK_TABS.findIndex((t) => t.key === key);

/** Every DTO the co-mounted track can show — what the shell pre-fills. */
export const TRACK_VIEW_KEYS: TrackViewKey[] = TRACK_TABS.flatMap((t) =>
  t.views.map((v) => v.key),
);

export const isTrackView = (v: string): v is TrackViewKey =>
  (TRACK_VIEW_KEYS as string[]).includes(v);

/** The tab that owns a view (every view belongs to exactly one). */
export const tabForView = (view: TrackViewKey): TrackTab =>
  TRACK_TABS.find((t) => t.views.some((v) => v.key === view)) as TrackTab;

export const trackTab = (key: TrackTabKey): TrackTab =>
  TRACK_TABS[trackIndex(key)];

export const trackView = (view: TrackViewKey): TrackView =>
  tabForView(view).views.find((v) => v.key === view) as TrackView;

/** Resolve a pathname back onto the track (used by popstate). */
export const viewForPath = (path: string): TrackViewKey | null => {
  for (const t of TRACK_TABS) {
    for (const v of t.views) if (v.href === path) return v.key;
  }
  return null;
};

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
  view: "templates" | "stats";
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

/** Health inside the track (FR-HLTH.1/.3): synced + manual metric series. */
export type HealthData = HealthOverview;

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
  health: HealthData;
  finance: FinanceData;
  review: ReviewData;
};

export type AnyTabData = TabDataMap[TabDataKey];

/** Params a deep link can contribute to its tab's initial data. */
export type TabParams = {
  view?: string;
  date?: string;
  session?: string;
  lift?: string;
};
