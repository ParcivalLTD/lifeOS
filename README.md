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

## Backups & export (NFR-4)

Every run dumps **all nine core tables into one JSON document**
(`{ version, generatedAt, counts, data }`):

- **Nightly**: Vercel Cron (see `vercel.json`) calls `GET /api/backup` at
  02:00 UTC with `Authorization: Bearer $CRON_SECRET`; the dump lands in the
  private `backups` Storage bucket (auto-created).
- **Manual**: Settings → "Export my data" downloads the JSON;
  "Back up to storage now" writes the same dump to the bucket. Recent
  backups are listed on the settings page.

## Deploying to Vercel

1. **Supabase project**: create one, then under Authentication → Sign In / Up
   disable **"Allow new users to sign up"** (mirrors `supabase/config.toml`).
2. **Migrate + owner**: with `DATABASE_URL` pointing at the project (use the
   **transaction pooler** URI, port 6543 — the app already sets
   `prepare: false`), run `npm run db:migrate`, then `npm run
   auth:create-owner` (needs `OWNER_EMAIL`/`OWNER_PASSWORD`/service key).
   Optionally `SEED_USER_ID=<owner id> npm run db:seed`.
3. **Vercel**: import the repo; `vercel.json` registers the nightly backup
   cron. Set the environment variables:

| Env var | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + local | Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + local | Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel + local | server-only: backups + owner script |
| `DATABASE_URL` | Vercel + local | transaction-pooler URI (port 6543) |
| `CRON_SECRET` | Vercel + local | bearer for `/api/backup`; any long random string |
| `OWNER_EMAIL` / `OWNER_PASSWORD` | local only | consumed by `auth:create-owner` |
| `SEED_USER_ID` | local only | consumed by `db:seed` |

4. **Install on your phone** (PWA, NFR-2): the deployed site serves a valid
   manifest (`standalone`, 192/512 + maskable icons) and a 180px
   apple-touch-icon — Android Chrome offers "Add to Home screen" install;
   on iOS Safari use Share → "Add to Home Screen".

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
