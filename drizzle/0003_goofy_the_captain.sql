CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY DEFAULT auth.uid() NOT NULL,
	"ai_provider" text DEFAULT 'anthropic' NOT NULL,
	"ai_model" text DEFAULT 'claude-3-7-sonnet-latest' NOT NULL,
	"anthropic_key" text,
	"openai_key" text,
	"gemini_key" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "user_settings_owner_all" ON "user_settings" AS PERMISSIVE FOR ALL TO "authenticated" USING ((select auth.uid()) = "user_settings"."user_id") WITH CHECK ((select auth.uid()) = "user_settings"."user_id");