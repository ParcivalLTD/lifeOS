-- External-calendar sync support on events (schema only — no behaviour yet).
--
-- NOTE: drizzle-kit also wanted to `DROP TABLE user_settings CASCADE` here.
-- That is PRE-EXISTING DRIFT, not part of this change: the table was created
-- by 0003 but has never appeared in src/db/schema.ts and no code references
-- it. It also holds API-key columns. Dropping it is a deliberate decision for
-- its own migration, so those statements were removed by hand. The table is
-- left untouched in the database.
CREATE TYPE "public"."event_source" AS ENUM('native', 'apple_calendar');--> statement-breakpoint
-- ADD COLUMN ... NOT NULL DEFAULT backfills every existing row with 'native'.
ALTER TABLE "events" ADD COLUMN "source" "event_source" DEFAULT 'native' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "external_calendar_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "events_source_external_uq" ON "events" USING btree ("user_id","source","external_id") WHERE "events"."external_id" IS NOT NULL;
