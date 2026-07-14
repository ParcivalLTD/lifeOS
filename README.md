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

### Local database

Any Postgres works. Disposable container matching `.env.example`:

```sh
docker run -d --name lifeos-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=lifeos \
  -p 54329:5432 postgres:16-alpine
```

Plain Postgres lacks Supabase's `auth.uid()` and roles, which the RLS
policies reference — apply the shim once per database (local only, **never**
on Supabase):

```sh
npm run db:shim
```

### Migrate, seed, run

```sh
npm run db:migrate   # apply drizzle/ migrations to DATABASE_URL
npm run db:seed      # realistic fake data across all six domains (idempotent)
npm run dev          # http://localhost:3000
```

When targeting a Supabase project instead: set `DATABASE_URL` to the project's
connection string, skip the shim, and set `SEED_USER_ID` to the owner's
`auth.users` id before seeding.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / serve |
| `npm run db:generate` | Generate SQL migrations from `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run db:seed` | Wipe + re-insert the seed user's data |
| `npm run db:shim` | Apply local-Postgres auth shim (not for Supabase) |
| `npm run db:studio` | Drizzle Studio DB browser |
| `node scripts/generate-icons.mjs` | Regenerate PWA icons |

## Layout

```
src/app/          Next.js App Router (layout, page, manifest, icons)
src/db/           Drizzle schema (spec §7, complete), client, seed
src/lib/supabase/ Supabase browser/server clients
drizzle/          Generated SQL migrations
scripts/          Icon generator, local auth shim
docs/             Product spec + design mockup (source of truth)
```
