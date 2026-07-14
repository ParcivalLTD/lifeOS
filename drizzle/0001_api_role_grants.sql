-- Table-level privileges for the Supabase API roles. Row access is governed
-- by the owner-only RLS policies (0000); this is the coarse layer beneath.
--
-- `anon` gets nothing: every LifeOS data surface requires a session (spec
-- NG1 — single user, no public access). Explicit revokes also neutralise
-- hosted Supabase's default privileges, which would otherwise grant anon
-- access to tables created by future migrations.

GRANT USAGE ON SCHEMA public TO authenticated, service_role;--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;--> statement-breakpoint
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;--> statement-breakpoint

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;--> statement-breakpoint

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
