/**
 * Helm core data model — spec §7, implemented in full (hub and spoke).
 *
 * All seven core entities ship in Phase 1 even though Phase 1 UIs only
 * exercise Tasks, Habits, and Events. Every core entity carries:
 * id, domain, created_at, updated_at, archived (spec §7) plus user_id for
 * RLS (NFR-6). Log tables (habit_completions, metric_datapoints) are
 * sub-records of their parent entity: they carry id/user_id/created_at only.
 *
 * RLS: every table is owner-only via `user_id = auth.uid()`. On plain local
 * Postgres (not Supabase), apply scripts/local-auth-shim.sql first — it
 * provides the `auth.uid()` function and the `authenticated` role that
 * Supabase ships natively.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const domainEnum = pgEnum("domain", [
  "personal",
  "academic",
  "work",
  "finance",
  "gym",
  "health",
]);

export const goalHorizonEnum = pgEnum("goal_horizon", [
  "life",
  "yearly",
  "quarterly",
  "monthly",
]);

export const goalStatusEnum = pgEnum("goal_status", [
  "active",
  "achieved",
  "abandoned",
  "paused",
]);

export const taskStatusEnum = pgEnum("task_status", ["open", "done", "dropped"]);

export const eventKindEnum = pgEnum("event_kind", [
  "appointment",
  "deadline",
  "session",
  "bill",
  "birthday",
  "other",
]);

export const metricDirectionEnum = pgEnum("metric_direction", [
  "higher-better",
  "lower-better",
  "target-range",
]);

/**
 * Where an Event came from. "native" = created in Helm and owned by it;
 * anything else is mirrored from an external calendar and is re-synced by
 * (source, external_id). Adding a provider is an explicit ALTER TYPE
 * migration, which is the point — a new sync source should be a deliberate
 * schema change, not a free-text value that silently varies.
 */
export const eventSourceEnum = pgEnum("event_source", ["native", "apple_calendar", "google_health"]);

/**
 * Which LLM vendor served a turn. Recorded so a transcript stays honest about
 * who generated what; the provider is LOCKED once a conversation has turns.
 */
export const aiProviderEnum = pgEnum("ai_provider", ["anthropic", "openai", "google"]);

export const habitCompletionStatusEnum = pgEnum("habit_completion_status", [
  "done",
  "skipped",
]);

export const linkRelationEnum = pgEnum("link_relation", [
  "funds",
  "supports",
  "blocks",
  "relates-to",
]);

/** Which core table a Link endpoint lives in (uuid alone is not resolvable). */
export const entityTypeEnum = pgEnum("entity_type", [
  "goal",
  "task",
  "habit",
  "event",
  "metric",
  "journal_entry",
]);

// ---------------------------------------------------------------------------
// Shared payload / JSON types
// ---------------------------------------------------------------------------

/**
 * Habit.schedule shapes (spec §7.3: daily, Mon/Wed/Fri, 3×/week).
 * `since` is set when the schedule is EDITED: stats (streak, adherence) are
 * computed only from that date forward, so the new schedule never
 * reinterprets history recorded under the old one. The completion log itself
 * is immutable fact and survives schedule changes untouched.
 */
export type HabitSchedule = (
  | { type: "daily" }
  | {
      type: "weekly_days";
      days: ("mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun")[];
    }
  | { type: "times_per_week"; times: number }
) & { since?: string };

export type GymSetLog = { kg: number; reps: number; done?: boolean };

/** Event.payload by kind (spec §7.4); open-ended for future kinds. */
export type EventPayload =
  | {
      template?: string;
      exercises: {
        name: string;
        targetSets: number;
        targetReps: number;
        targetKg?: number;
        sets: GymSetLog[];
      }[];
    }
  | { amount: number; currency: string; autopay?: boolean }
  | Record<string, unknown>;

// ---------------------------------------------------------------------------
// Shared columns (spec §7 preamble + NFR-6)
// ---------------------------------------------------------------------------

const coreEntityColumns = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().default(sql`auth.uid()`),
  domain: domainEnum("domain").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  archived: boolean("archived").notNull().default(false),
});

const logRowColumns = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().default(sql`auth.uid()`),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Owner-only RLS policy: rows are visible/writable iff user_id = auth.uid(). */
const ownerPolicy = (table: string, userId: AnyPgColumn) =>
  pgPolicy(`${table}_owner_all`, {
    as: "permissive",
    for: "all",
    to: authenticatedRole,
    using: sql`(select auth.uid()) = ${userId}`,
    withCheck: sql`(select auth.uid()) = ${userId}`,
  });

// ---------------------------------------------------------------------------
// Goal (§7.1)
// ---------------------------------------------------------------------------

export const goals = pgTable(
  "goals",
  {
    ...coreEntityColumns(),
    title: text("title").notNull(),
    description: text("description"),
    horizon: goalHorizonEnum("horizon").notNull(),
    parentGoalId: uuid("parent_goal_id").references((): AnyPgColumn => goals.id, {
      onDelete: "set null",
    }),
    targetDate: date("target_date"),
    status: goalStatusEnum("status").notNull().default("active"),
    successCriteria: text("success_criteria"),
  },
  (t) => [
    index("goals_user_idx").on(t.userId),
    index("goals_parent_idx").on(t.parentGoalId),
    index("goals_status_idx").on(t.status),
    ownerPolicy("goals", t.userId),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// Event (§7.4) — before tasks, which reference it
// ---------------------------------------------------------------------------

export const events = pgTable(
  "events",
  {
    ...coreEntityColumns(),
    title: text("title").notNull(),
    start: timestamp("start", { withTimezone: true }).notNull(),
    end: timestamp("end", { withTimezone: true }),
    allDay: boolean("all_day").notNull().default(false),
    kind: eventKindEnum("kind").notNull().default("other"),
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
    payload: jsonb("payload").$type<EventPayload>(),

    // --- external-calendar sync (no behaviour yet; schema support only) ----
    /** Owner of this row's truth. Everything created in-app is "native". */
    source: eventSourceEnum("source").notNull().default("native"),
    /** The provider's stable id for the event (iCalendar UID). Null for native. */
    externalId: text("external_id"),
    /** Which remote calendar it came from, so one account can sync several. */
    externalCalendarId: text("external_calendar_id"),
  },
  (t) => [
    index("events_user_idx").on(t.userId),
    index("events_start_idx").on(t.start),
    index("events_kind_idx").on(t.kind),
    /**
     * Re-syncing the same remote event must UPSERT, never duplicate.
     *
     * PARTIAL (`WHERE external_id IS NOT NULL`) because every native row has a
     * null external_id: Postgres treats nulls as distinct, so they would never
     * collide anyway — this just keeps them out of the index entirely.
     *
     * USER-SCOPED even though the app is single-tenant (NG1). The house rule
     * is that server-side Drizzle bypasses RLS and every user-scoped write
     * must carry user_id explicitly; a conflict target of (source,
     * external_id) alone would be the one write path that silently doesn't.
     * Scoping it here forces the sync upsert's ON CONFLICT to name user_id.
     */
    uniqueIndex("events_source_external_uq")
      .on(t.userId, t.source, t.externalId)
      .where(sql`${t.externalId} IS NOT NULL`),
    ownerPolicy("events", t.userId),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// Task (§7.2)
// ---------------------------------------------------------------------------

export const tasks = pgTable(
  "tasks",
  {
    ...coreEntityColumns(),
    title: text("title").notNull(),
    notes: text("notes"),
    dueDate: date("due_date"),
    priority: smallint("priority").notNull().default(2),
    status: taskStatusEnum("status").notNull().default("open"),
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
    eventId: uuid("event_id").references(() => events.id, {
      onDelete: "set null",
    }),
    /** RFC 5545 RRULE string, e.g. "FREQ=WEEKLY;BYDAY=SU". */
    recurrence: text("recurrence"),
  },
  (t) => [
    index("tasks_user_idx").on(t.userId),
    index("tasks_status_idx").on(t.status),
    index("tasks_due_idx").on(t.dueDate),
    check("tasks_priority_range", sql`${t.priority} BETWEEN 1 AND 3`),
    ownerPolicy("tasks", t.userId),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// Habit (§7.3) + completion log
// ---------------------------------------------------------------------------

export const habits = pgTable(
  "habits",
  {
    ...coreEntityColumns(),
    title: text("title").notNull(),
    schedule: jsonb("schedule").$type<HabitSchedule>().notNull(),
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
  },
  (t) => [index("habits_user_idx").on(t.userId), ownerPolicy("habits", t.userId)],
).enableRLS();

export const habitCompletions = pgTable(
  "habit_completions",
  {
    ...logRowColumns(),
    habitId: uuid("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    status: habitCompletionStatusEnum("status").notNull(),
  },
  (t) => [
    uniqueIndex("habit_completions_habit_date_uq").on(t.habitId, t.date),
    index("habit_completions_user_idx").on(t.userId),
    index("habit_completions_date_idx").on(t.date),
    ownerPolicy("habit_completions", t.userId),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// Metric (§7.5) + time-series datapoints
// ---------------------------------------------------------------------------

export const metrics = pgTable(
  "metrics",
  {
    ...coreEntityColumns(),
    name: text("name").notNull(),
    unit: text("unit"),
    direction: metricDirectionEnum("direction").notNull(),
  },
  (t) => [
    index("metrics_user_idx").on(t.userId),
    ownerPolicy("metrics", t.userId),
  ],
).enableRLS();

export const metricDatapoints = pgTable(
  "metric_datapoints",
  {
    ...logRowColumns(),
    metricId: uuid("metric_id")
      .notNull()
      .references(() => metrics.id, { onDelete: "cascade" }),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    value: doublePrecision("value").notNull(),
    /**
     * Provenance/attribution. Long predates external sync and is LOAD-BEARING
     * with per-row values: `gym:<sessionId>` (deleted by exact match when a
     * session recomputes), `accounts`, `acad:<courseId>`, `work:<projectId>`,
     * `manual`, … — all native-origin. External sync adds flat provider
     * values (`google_health`, `photo_estimate`) alongside them; existing
     * values are never rewritten. Default `native` covers writers that don't
     * attribute more specifically.
     */
    source: text("source").default("native"),
    /**
     * The provider's stable id for a synced datapoint (Google Health
     * `users/{u}/dataTypes/{t}/dataPoints/{id}`, suffixed `#facet` when one
     * provider record fans out into several Metrics, e.g. a nutrition log's
     * kcal/protein/carbs/fat). Null for native rows.
     */
    externalId: text("external_id"),
  },
  (t) => [
    index("metric_datapoints_metric_ts_idx").on(t.metricId, t.timestamp),
    index("metric_datapoints_user_idx").on(t.userId),
    /**
     * Webhook redeliveries must UPSERT, never duplicate — Google retries any
     * non-204 delivery with backoff for up to 7 days, and explicitly warns
     * that retries can duplicate UPSERT notifications. Same shape as the
     * events sync index: PARTIAL (native rows all have null external_id and
     * would never collide anyway) and USER-SCOPED (the conflict target must
     * name user_id per the RLS-bypass rule).
     */
    uniqueIndex("metric_datapoints_source_external_uq")
      .on(t.userId, t.source, t.externalId)
      .where(sql`${t.externalId} IS NOT NULL`),
    ownerPolicy("metric_datapoints", t.userId),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// Journal entry (§7.6)
// ---------------------------------------------------------------------------

export const journalEntries = pgTable(
  "journal_entries",
  {
    ...coreEntityColumns(),
    date: date("date").notNull(),
    /** Markdown. Excluded from LLM context by default (NFR-1). */
    body: text("body").notNull(),
    mood: smallint("mood"),
    energy: smallint("energy"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  },
  (t) => [
    index("journal_entries_user_idx").on(t.userId),
    index("journal_entries_date_idx").on(t.date),
    check(
      "journal_entries_mood_range",
      sql`${t.mood} IS NULL OR ${t.mood} BETWEEN 1 AND 5`,
    ),
    check(
      "journal_entries_energy_range",
      sql`${t.energy} IS NULL OR ${t.energy} BETWEEN 1 AND 5`,
    ),
    ownerPolicy("journal_entries", t.userId),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// Link (§7.7) — cross-domain graph between any two core objects
// ---------------------------------------------------------------------------

export const links = pgTable(
  "links",
  {
    ...coreEntityColumns(),
    fromId: uuid("from_id").notNull(),
    fromType: entityTypeEnum("from_type").notNull(),
    toId: uuid("to_id").notNull(),
    toType: entityTypeEnum("to_type").notNull(),
    relation: linkRelationEnum("relation").notNull(),
  },
  (t) => [
    uniqueIndex("links_from_to_relation_uq").on(t.fromId, t.toId, t.relation),
    index("links_user_idx").on(t.userId),
    ownerPolicy("links", t.userId),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// Assistant conversations (Phase 4) — app infrastructure, NOT a §7 entity
// ---------------------------------------------------------------------------
//
// Deliberate, owner-directed exception to the "modules own no private tables"
// rule (§5.1): a chat transcript is not a life-domain object. It has no
// domain semantics, never belongs on the unified calendar, and never rolls up
// to a goal — modelling it as Events would abuse the core. It sits alongside
// the core like the backup files do. Owner-only RLS + forUser like everything
// else, and it IS included in the NFR-4 export.

export const conversationRoleEnum = pgEnum("conversation_role", [
  "user",
  "assistant",
]);

export const conversations = pgTable(
  "conversations",
  {
    ...coreEntityColumns(),
    /** Auto-titled from the first user message; editable later. */
    title: text("title").notNull().default("New chat"),
    /** The provider this conversation is bound to. Null until the first
     * assistant turn, then LOCKED — replaying a transcript through a
     * different vendor's tool-calling conventions is not something we can
     * promise is faithful, so the picker disables once turns exist. */
    provider: aiProviderEnum("provider"),
    /** Capability tier last chosen (fast | balanced | deep). Switchable at
     * any time — it only selects a model within the locked provider. */
    tier: text("tier"),
  },
  (t) => [
    index("conversations_user_idx").on(t.userId),
    index("conversations_updated_idx").on(t.updatedAt),
    ownerPolicy("conversations", t.userId),
  ],
).enableRLS();

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    ...logRowColumns(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: conversationRoleEnum("role").notNull(),
    /** Plain text, for display and auto-titling. */
    text: text("text").notNull().default(""),
    /** Verbatim API content blocks (incl. tool_use proposals), replayed to
     * the model on later turns. Null for plain user turns. */
    blocks: jsonb("blocks").$type<unknown[]>(),
    /** Owner decisions on this turn's proposals, keyed by proposal:
     * {"<callId>:<index>": "approved" | "rejected"}. Confirmed-action state
     * survives a reload — nothing is ever re-applied on resume. */
    decisions: jsonb("decisions").$type<Record<string, string>>(),
    /** Which provider generated this turn (null for user turns and for
     * assistant turns written before multi-provider support). */
    provider: aiProviderEnum("provider"),
    /** The exact vendor model id that produced it, e.g. "claude-opus-4-8".
     * Free text: model ids churn faster than any enum could track. */
    model: text("model"),
  },
  (t) => [
    index("conversation_messages_conversation_idx").on(t.conversationId),
    index("conversation_messages_user_idx").on(t.userId),
    ownerPolicy("conversation_messages", t.userId),
  ],
).enableRLS();
