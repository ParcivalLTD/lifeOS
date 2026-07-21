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

- **Nightly**: a **Coolify Scheduled Task** calls `GET /api/backup` at
  02:00 with `Authorization: Bearer $CRON_SECRET`; the dump lands in the
  private `backups` Storage bucket (auto-created).
- ⚠️ This is a **logical** backup of the app's own tables. It is not a
  substitute for volume-level backups of the Postgres data directory, which
  are the owner's responsibility on self-hosted infrastructure.
- **Manual**: Settings → "Export my data" downloads the JSON;
  "Back up to storage now" writes the same dump to the bucket. Recent
  backups are listed on the settings page.

## AI providers (Claude · ChatGPT · Gemini)

The assistant runs on any of three providers, chosen per conversation. Each is
enabled purely by setting its key — a provider with no key is **hidden from the
picker**, never an error. With none set, the AI layer is off.

Every provider offers the same three tiers:

| Tier | Claude | ChatGPT | Gemini |
|---|---|---|---|
| Fast | `claude-haiku-4-5` | `gpt-5.6-luna` | `gemini-3.1-flash-lite` |
| Balanced | `claude-sonnet-5` | `gpt-5.6-terra` | `gemini-3.5-flash` |
| Deep | `claude-opus-4-8` | `gpt-5.6-sol` | `gemini-2.5-pro` |

**Provider is locked once a conversation has a reply**; the tier stays
switchable. A transcript carries that vendor's tool-call ids and your approve/
reject decisions are keyed on them, so re-serving it through another vendor's
conventions can't be guaranteed faithful. Start a new chat to switch provider.

**Parity is enforced, not assumed.** The propose→approve flow is identical
whoever generates it: adapters normalise each vendor's tool-calling convention
into one canonical shape, so the same review card and the same validated write
path run regardless. `npm run test:providers` proves it — one proposal through
all three native wire formats, asserting identical cards and identical DB rows.

> ⚠️ **Gemini's free tier lets Google use submitted content to improve their
> products.** Helm sends structured summaries of your personal data, so this is
> a real trade-off. The model picker labels it at the point of selection; the
> Claude and ChatGPT tiers are paid and don't carry it.

## Apple Calendar sync (iCloud → Helm)

One-way mirror of every calendar on an iCloud account. **Read-only: Helm never
writes to iCloud.** That is enforced in code — every request goes through one
helper that accepts only `PROPFIND`/`REPORT`/`GET` and throws on anything else,
and `npm run test:caldav` asserts no write verb exists in the client.

Mirrored events are ordinary Events (`source="apple_calendar"`), so they appear
on the unified calendar and dashboard like anything else.

**Connecting** (Settings → Apple Calendar). Apple does not allow a normal
account password over CalDAV, so this step is manual and cannot be automated:

1. Two-factor auth must already be enabled on the Apple ID.
2. [appleid.apple.com](https://appleid.apple.com) → Sign-In and Security →
   App-Specific Passwords → generate one.
3. Paste it with the Apple ID in Settings.

The credentials are verified against iCloud before being saved, then stored
**encrypted at rest** (AES-256-GCM) under `CALDAV_ENCRYPTION_KEY`. That key
lives only in the server environment, never in the database — so a database
dump alone cannot recover the password, and the NFR-4 backup redacts the
sealed value entirely.

**When it breaks.** App-specific passwords can be revoked at any time. If
iCloud rejects the stored credential, the connection is marked `broken` and
Settings shows an explicit **Reconnect Apple Calendar** state with the reason.
Sync does not silently retry forever pretending nothing is wrong.

### Scheduled sync — Coolify Scheduled Task

Syncing is triggered by an HTTP call, so it needs no external scheduler and no
`vercel.json`; it runs on our own infrastructure. In Coolify, add a
**Scheduled Task** to the Helm application:

| Setting | Value |
|---|---|
| Frequency | `*/15 * * * *` (every 15 minutes) |
| Command | `curl -fsS -H "Authorization: Bearer $CALDAV_SYNC_SECRET" https://YOUR-HOST/api/sync/apple-calendar` |

The route is `GET /api/sync/apple-calendar` (POST works too) and authorises the
`CALDAV_SYNC_SECRET` bearer — the same pattern as the nightly backup's
`CRON_SECRET`. A signed-in owner can also hit it from Settings → "Sync now".

It responds with a summary:

```json
{ "ok": true, "created": 3, "updated": 41, "errors": 0, "calendars": 2 }
```

Status codes: `200` synced · `401` bad/missing bearer · `404` not connected ·
`409` iCloud rejected the credentials (reconnect needed) · `500` other failure.

Re-syncing is safe at any cadence: every occurrence upserts on
`(user_id, source, external_id)`, so an unchanged calendar creates nothing.

## Deploying (self-hosted on Coolify)

Both the app and Supabase run on the owner's own server via Coolify. There is
no platform tier, no function duration cap and no cron frequency limit — see
CLAUDE.md § Infrastructure before designing around any such constraint.

1. **Supabase**: deploy the self-hosted stack (Postgres + auth + storage) in
   Coolify. Disable sign-ups in the auth service
   (`GOTRUE_DISABLE_SIGNUP=true`), mirroring `supabase/config.toml` — the
   single owner account is created manually in step 2.
   ⚠️ Give Postgres (`/var/lib/postgresql/data`) and Storage
   (`/var/lib/storage`) **persistent volumes**. Coolify recreates containers
   on redeploy; anything on the container's writable layer is destroyed.
2. **Migrate + owner**: with `DATABASE_URL` pointing at that Postgres, run
   `npm run db:migrate`, then `npm run auth:create-owner` (needs
   `OWNER_EMAIL`/`OWNER_PASSWORD`/service key). Optionally
   `SEED_USER_ID=<owner id> npm run db:seed`.
   (The app sets `prepare: false`, so a pooler in front of Postgres is safe
   but not required — self-hosted usually connects direct on 5432.)
3. **App**: create a Coolify application from this repo — it builds with
   **Nixpacks**, no Dockerfile needed. Set the environment variables below.
4. **Nightly backup**: add a **Coolify Scheduled Task** (`0 2 * * *`) that
   calls `GET /api/backup` with `Authorization: Bearer $CRON_SECRET`. This
   replaces the old `vercel.json` cron; scheduled jobs are never registered
   from repo config.
5. **Apple Calendar sync**: add a second Coolify Scheduled Task
   (`*/15 * * * *`) calling `GET /api/sync/apple-calendar` with
   `Authorization: Bearer $CALDAV_SYNC_SECRET` — see the section above.

| Env var | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Coolify + local | public URL of the Supabase stack |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Coolify + local | from the Supabase stack's config |
| `SUPABASE_SERVICE_ROLE_KEY` | Coolify + local | server-only: backups + owner script |
| `DATABASE_URL` | Coolify + local | Postgres URI |
| `CRON_SECRET` | Coolify + local | bearer for `/api/backup`; any long random string |
| `CALDAV_ENCRYPTION_KEY` | Coolify + local | encrypts the stored Apple app-specific password; `openssl rand -base64 32` |
| `CALDAV_SYNC_SECRET` | Coolify + local | bearer for `/api/sync/apple-calendar`; `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | Coolify | enables the Claude provider |
| `OPENAI_API_KEY` | Coolify | enables the ChatGPT provider |
| `GOOGLE_AI_API_KEY` | Coolify | enables the Gemini provider |
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
| `npm run test:caldav` | Apple Calendar sync against a local mock CalDAV server |
| `npm run test:providers` | Multi-provider parity: identical review card + DB write from all three |
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
