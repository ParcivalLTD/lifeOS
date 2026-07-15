CREATE TYPE "public"."domain" AS ENUM('personal', 'academic', 'work', 'finance', 'gym', 'health');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('goal', 'task', 'habit', 'event', 'metric', 'journal_entry');--> statement-breakpoint
CREATE TYPE "public"."event_kind" AS ENUM('appointment', 'deadline', 'session', 'bill', 'birthday', 'other');--> statement-breakpoint
CREATE TYPE "public"."goal_horizon" AS ENUM('life', 'yearly', 'quarterly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('active', 'achieved', 'abandoned', 'paused');--> statement-breakpoint
CREATE TYPE "public"."habit_completion_status" AS ENUM('done', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."link_relation" AS ENUM('funds', 'supports', 'blocks', 'relates-to');--> statement-breakpoint
CREATE TYPE "public"."metric_direction" AS ENUM('higher-better', 'lower-better', 'target-range');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'done', 'dropped');--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"domain" "domain" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"title" text NOT NULL,
	"start" timestamp with time zone NOT NULL,
	"end" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"kind" "event_kind" DEFAULT 'other' NOT NULL,
	"goal_id" uuid,
	"payload" jsonb
);
--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"domain" "domain" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"horizon" "goal_horizon" NOT NULL,
	"parent_goal_id" uuid,
	"target_date" date,
	"status" "goal_status" DEFAULT 'active' NOT NULL,
	"success_criteria" text
);
--> statement-breakpoint
ALTER TABLE "goals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "habit_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"habit_id" uuid NOT NULL,
	"date" date NOT NULL,
	"status" "habit_completion_status" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "habit_completions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"domain" "domain" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"title" text NOT NULL,
	"schedule" jsonb NOT NULL,
	"goal_id" uuid
);
--> statement-breakpoint
ALTER TABLE "habits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"domain" "domain" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"date" date NOT NULL,
	"body" text NOT NULL,
	"mood" smallint,
	"energy" smallint,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "journal_entries_mood_range" CHECK ("journal_entries"."mood" IS NULL OR "journal_entries"."mood" BETWEEN 1 AND 5),
	CONSTRAINT "journal_entries_energy_range" CHECK ("journal_entries"."energy" IS NULL OR "journal_entries"."energy" BETWEEN 1 AND 5)
);
--> statement-breakpoint
ALTER TABLE "journal_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"domain" "domain" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"from_id" uuid NOT NULL,
	"from_type" "entity_type" NOT NULL,
	"to_id" uuid NOT NULL,
	"to_type" "entity_type" NOT NULL,
	"relation" "link_relation" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "metric_datapoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metric_id" uuid NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"value" double precision NOT NULL,
	"source" text
);
--> statement-breakpoint
ALTER TABLE "metric_datapoints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"domain" "domain" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"unit" text,
	"direction" "metric_direction" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "metrics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"domain" "domain" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"due_date" date,
	"priority" smallint DEFAULT 2 NOT NULL,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"goal_id" uuid,
	"event_id" uuid,
	"recurrence" text,
	CONSTRAINT "tasks_priority_range" CHECK ("tasks"."priority" BETWEEN 1 AND 3)
);
--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_parent_goal_id_goals_id_fk" FOREIGN KEY ("parent_goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_completions" ADD CONSTRAINT "habit_completions_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_datapoints" ADD CONSTRAINT "metric_datapoints_metric_id_metrics_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."metrics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_user_idx" ON "events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "events_start_idx" ON "events" USING btree ("start");--> statement-breakpoint
CREATE INDEX "events_kind_idx" ON "events" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "goals_user_idx" ON "goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "goals_parent_idx" ON "goals" USING btree ("parent_goal_id");--> statement-breakpoint
CREATE INDEX "goals_status_idx" ON "goals" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "habit_completions_habit_date_uq" ON "habit_completions" USING btree ("habit_id","date");--> statement-breakpoint
CREATE INDEX "habit_completions_user_idx" ON "habit_completions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "habit_completions_date_idx" ON "habit_completions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "habits_user_idx" ON "habits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "journal_entries_user_idx" ON "journal_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "journal_entries_date_idx" ON "journal_entries" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "links_from_to_relation_uq" ON "links" USING btree ("from_id","to_id","relation");--> statement-breakpoint
CREATE INDEX "links_user_idx" ON "links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "metric_datapoints_metric_ts_idx" ON "metric_datapoints" USING btree ("metric_id","timestamp");--> statement-breakpoint
CREATE INDEX "metric_datapoints_user_idx" ON "metric_datapoints" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "metrics_user_idx" ON "metrics" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_user_idx" ON "tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_due_idx" ON "tasks" USING btree ("due_date");--> statement-breakpoint
CREATE POLICY "events_owner_all" ON "events" AS PERMISSIVE FOR ALL TO "authenticated" USING ((select auth.uid()) = "events"."user_id") WITH CHECK ((select auth.uid()) = "events"."user_id");--> statement-breakpoint
CREATE POLICY "goals_owner_all" ON "goals" AS PERMISSIVE FOR ALL TO "authenticated" USING ((select auth.uid()) = "goals"."user_id") WITH CHECK ((select auth.uid()) = "goals"."user_id");--> statement-breakpoint
CREATE POLICY "habit_completions_owner_all" ON "habit_completions" AS PERMISSIVE FOR ALL TO "authenticated" USING ((select auth.uid()) = "habit_completions"."user_id") WITH CHECK ((select auth.uid()) = "habit_completions"."user_id");--> statement-breakpoint
CREATE POLICY "habits_owner_all" ON "habits" AS PERMISSIVE FOR ALL TO "authenticated" USING ((select auth.uid()) = "habits"."user_id") WITH CHECK ((select auth.uid()) = "habits"."user_id");--> statement-breakpoint
CREATE POLICY "journal_entries_owner_all" ON "journal_entries" AS PERMISSIVE FOR ALL TO "authenticated" USING ((select auth.uid()) = "journal_entries"."user_id") WITH CHECK ((select auth.uid()) = "journal_entries"."user_id");--> statement-breakpoint
CREATE POLICY "links_owner_all" ON "links" AS PERMISSIVE FOR ALL TO "authenticated" USING ((select auth.uid()) = "links"."user_id") WITH CHECK ((select auth.uid()) = "links"."user_id");--> statement-breakpoint
CREATE POLICY "metric_datapoints_owner_all" ON "metric_datapoints" AS PERMISSIVE FOR ALL TO "authenticated" USING ((select auth.uid()) = "metric_datapoints"."user_id") WITH CHECK ((select auth.uid()) = "metric_datapoints"."user_id");--> statement-breakpoint
CREATE POLICY "metrics_owner_all" ON "metrics" AS PERMISSIVE FOR ALL TO "authenticated" USING ((select auth.uid()) = "metrics"."user_id") WITH CHECK ((select auth.uid()) = "metrics"."user_id");--> statement-breakpoint
CREATE POLICY "tasks_owner_all" ON "tasks" AS PERMISSIVE FOR ALL TO "authenticated" USING ((select auth.uid()) = "tasks"."user_id") WITH CHECK ((select auth.uid()) = "tasks"."user_id");