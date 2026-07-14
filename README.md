# LifeOS

Private, single-user web app that acts as an operating system for the owner's
life. See [`docs/lifeos-spec.md`](docs/lifeos-spec.md) (product spec) and
[`CLAUDE.md`](CLAUDE.md) (working agreements, design system, current scope).

**Current scope: Phase 1 — "Spine"** (auth, core data model, Today dashboard,
Tasks, Habits, unified calendar). The full §7 schema ships now; deferred-module
UIs do not.

## Stack

Next.js (App Router, PWA) · Tailwind CSS (hand-rolled components) ·
Supabase (Postgres, auth) · Drizzle ORM · Recharts.

## Getting started

```sh
npm install
cp .env.example .env.local   # then fill in values
```

### Local development (full Supabase stack — recommended)

Runs real Postgres + GoTrue auth + API gateway in Docker:

```sh
npx supabase start     # first run pulls images
npx supabase status    # copy API URL, anon key, service_role key → .env.local
```

Set in `.env.local`:
`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, the anon + service keys,
and `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

### Auth (single user, no sign-up)

Public sign-up is disabled everywhere: there is no sign-up UI, and
`supabase/config.toml` ships with `enable_signup = false` (mirror this on a
hosted project: Authentication → Sign In / Up → disable "Allow new users to
sign up"). The one owner account is created via the admin API:

```sh
npm run auth:create-owner   # uses OWNER_EMAIL / OWNER_PASSWORD from .env.local
```

Copy the printed user id into `SEED_USER_ID` in `.env.local` before seeding.
All routes except `/login` require a session (enforced in `src/proxy.ts`);
every table is protected by owner-only row-level security.

### Migrate, seed, run

```sh
npm run db:migrate   # apply drizzle/ migrations to DATABASE_URL
npm run db:seed      # realistic fake data across all six domains (idempotent)
npm run dev          # http://localhost:3000 → redirects to /login
```

### Alternative: plain Postgres (no auth stack)

Any Postgres works for schema/seed work (the app's login flow won't function
without Supabase auth):

```sh
docker run -d --name lifeos-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=lifeos \
  -p 54329:5432 postgres:16-alpine
npm run db:shim      # stubs auth.uid() + roles — local only, NEVER on Supabase
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / serve |
| `npm run auth:create-owner` | Create the single owner account (admin API) |
| `npm run test:auth` | E2E auth + RLS test (needs stack + dev server running) |
| `npm run db:generate` | Generate SQL migrations from `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run db:seed` | Wipe + re-insert the seed user's data |
| `npm run db:shim` | Apply local-Postgres auth shim (not for Supabase) |
| `npm run db:studio` | Drizzle Studio DB browser |
| `node scripts/generate-icons.mjs` | Regenerate PWA icons |

## Layout

```
src/app/          Next.js App Router (login, auth routes, manifest, icons)
src/proxy.ts      Session refresh + route protection (all routes gated)
src/db/           Drizzle schema (spec §7, complete), client, seed
src/lib/supabase/ Supabase browser/server/middleware clients
drizzle/          Generated SQL migrations
supabase/         Local stack config (sign-up disabled)
scripts/          Owner creation, icon generator, local auth shim
docs/             Product spec + design mockup (source of truth)
```
