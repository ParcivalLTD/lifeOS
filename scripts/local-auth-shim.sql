-- Local-Postgres-only shim. DO NOT run against Supabase — Supabase ships the
-- auth schema, auth.uid(), and these roles natively.
--
-- The schema's RLS policies and user_id defaults reference auth.uid() and the
-- `authenticated` role, so a plain Postgres (e.g. the local dev container)
-- needs these stubs before migrations can run.

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end
$$;

-- Supabase grants these roles access to public-schema objects by default;
-- mirror that locally so RLS behaviour can be exercised via SET ROLE.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

create schema if not exists auth;

-- Mirrors Supabase's auth.uid(): resolves the caller's JWT subject, or NULL.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
