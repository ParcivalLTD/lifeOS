# CLAUDE.md — Helm

Guidance for Claude Code when working in this repository. Source of truth:
`docs/helm-spec.md` (product spec v0.1) and `docs/design/Helm.dc.html`
(interactive design mockup). If this file and the spec disagree, the spec wins —
then update this file.

## What Helm is

Helm is a **private, single-user web app** that acts as an operating system for
the owner's life. It unifies personal admin, academic planning, work/career,
finance, gym, and health into one application built on a **shared data model**,
with a daily dashboard, a universal goal engine, a structured review system, and
an AI assistant layer on top.

> One-liner: a personal life dashboard that knows everything about your goals,
> plans, and habits — and acts like an assistant, not just a tracker.

The value is not any individual module; it is the **cross-domain intelligence**
and the **review cadence** that are only possible when everything lives in one
system. Single tenant, no sharing, no monetisation (spec §3 non-goals).

## ⚠️ Current scope: PHASES 1–3 done + PHASE 4 in progress

Phase 1 ("Spine") is complete. **Phase 2 is complete** (owner-directed): the
**Gym module** (§8.8), **Finance module** (§8.7), and **universal goal
engine** (§8.2) are all built. The goal engine wired the savings-goal `funds→`
life-goal Links that Finance had stubbed. **Phase 3 is complete**
(owner-directed): the **Academic module** (§8.5), **Work module** (§8.6),
and **Review system** (§8.10) are built. **Phase 4 steps 1–3 are built**
(owner-directed): the **AI context assembler + privacy boundary** (step 1),
the **chat assistant with the CONFIRMED-ACTION write model, now streaming
and persisted** (step 2), and the **dashboard daily nudge** (step 3) — see
the AI-layer section below. External integrations are not started. The
Phase-1 scope below stays as the baseline the app must keep satisfying.

Phase 1 ("Spine"), all shipped (spec §11):

- **Auth** — Supabase email+password, public sign-up **disabled**; the single
  owner account is created manually in Supabase. Standard session security +
  RLS on `user_id` (NFR-6).
- **Core data model** — the **full** schema from §7 below (all seven entities),
  even though Phase 1 UIs only exercise Tasks, Habits, and Events. The
  hub-and-spoke core is real from day one; the other entities simply have no UI
  yet.
- **Today dashboard** — the app's home route. Live panels: Schedule (today's
  Events, all domains), top-3 Tasks, and Habits checklist — all actionable
  inline. Deferred slots render as **honest placeholders** (decided
  2026-07-15, superseding the earlier no-placeholder rule): a static inverted
  assistant-nudge banner marked PHASE 4, and Budget/Workout cards as
  "ships with Phase 2" empty states with ghost bars — never fake data.
- **Tasks** — list with due dates, priorities (1–3), recurrence.
- **Habits** — tracker with completion log, streaks, adherence %.
- **Unified calendar** — month/week/day views of all Events regardless of
  domain, colour-coded by domain (FR-CAL.1/2).

Phase 1 is done when the owner uses it every morning instead of separate
to-do + calendar apps.

### Explicitly deferred — do NOT build these

| Deferred | Phase |
|---|---|
| ~~Gym module (programs, session logging, PRs/1RM, adherence)~~ — **BUILT** (Phase 2) | 2 |
| ~~Finance module (accounts, net worth, budgets, expenses, savings goals, bills)~~ — **BUILT** (Phase 2) | 2 |
| ~~Goal engine UI (Goals page, goal detail, progress roll-ups)~~ — **BUILT** (Phase 2) | 2 |
| ~~Academic module (courses, assessments, study hours, pace flags)~~ — **BUILT** (Phase 3) | 3 |
| ~~Work module (projects, achievements log, career goals, time tracking)~~ — **BUILT** (Phase 3) | 3 |
| ~~Review system (weekly/monthly reviews, timeline)~~ — **BUILT** (Phase 3) | 3 |
| AI assistant (chat, plans, daily nudge) — *steps 1–3 (assembler + boundary, chat w/ confirmed-action writes, dashboard daily nudge) BUILT* | 4 |
| External integrations (Google Calendar, bank feeds/Basiq, health import) | 4 |

If a task appears to require a still-deferred module, stop and flag it rather
than building ahead. Schema-level support (e.g. `goal_id` FKs, the `goals`
table itself) is fine — user-facing features are not.

### Gym module → core mapping (hub-and-spoke, no private tables)

- **Templates & sessions are Events** (`kind=session`, `domain=gym`). A
  template carries `payload.isTemplate=true` + target exercises; it is a
  reusable definition, not a dated occurrence, so `listEventsInRange`
  excludes it (`notATemplate`) and it never hits the calendar/dashboard. A
  logged session carries `payload.exercises[].sets[] = {kg,reps,done}`.
- **e1RM / PRs are Metrics** (`<Lift> e1RM`, domain gym): logging a set
  recomputes the session's contribution per lift (Epley), one datapoint
  sourced `gym:<sessionId>` (idempotent). PRs = max datapoint per lift.
- **Adherence** counts gym session Events per week (planned = exists,
  completed = has a logged set). All queries go through `forUser`.

### Finance module → core mapping (hub-and-spoke, no private tables)

- **Accounts, budgets, expenses, savings goals, and recurring bill
  definitions are Events** (`domain=finance`) with a `payload.fin`
  discriminator (`account|budget|expense|savings|bill`). These aren't dated
  occurrences, so `calendarVisible` (in data/events.ts) excludes any Event
  whose payload has a `fin` key. **Generated bill occurrences** are ordinary
  `kind=bill` Events with `{amount,currency}` (no `fin` key) → they stay on
  the calendar as reminders (FR-FIN.4).
- **Net worth is a Metric** ("Net worth", domain finance): changing an
  account recomputes today's datapoint = Σ balances (source `accounts`);
  history gives the trend chart (FR-FIN.1).
- **Budget vs actual** = each budget's cap vs Σ this-month expense amounts in
  that category. Expense capture is the app's fastest flow (optimistic).
- **Savings `funds→` life-goal Link** is now wired: a savings goal (Event)
  —funds→ a Goal via a §7.7 Link (`fromType=event`, `toType=goal`). The
  Finance page reads it (`savingsFundsGoals`); edit a savings goal to pick the
  life goal it funds.

### Academic module → core mapping (hub-and-spoke, no private tables)

- **Courses are Events** (`domain=academic`, `payload.acad="course"` with
  code/semester/targetGrade/plannedHours) — definitions, not occurrences, so
  `calendarVisible` excludes any Event whose payload has an `acad` key.
  A course's `goal_id` points at its course Goal.
- **Assessments are Events** (`kind=deadline`, payload
  `{courseId, name, weight, grade?}`) → they STAY on the unified calendar.
  **Study sessions are Events** (`kind=session`, payload `{courseId, hours}`)
  → calendar blocks; weekly actuals vs the course's `plannedHours`
  (FR-ACAD.3).
- **Course grades are Metrics** (`<CODE> grade`, domain academic): grading
  recomputes a weighted current grade over GRADED work only, one datapoint
  per day sourced `acad:<courseId>` (idempotent), auto-linked
  `—relates-to→` the course Goal so engine progress uses it.
- **FR-ACAD.1 reuses the goal engine**: direction (life) → year → semester →
  course goals nest via `parent_goal_id`; no parallel structure. Course-goal
  titles must not contain digits other than the target grade (`parseTarget`
  takes the max number — "COMP3888" would read as target 3888).
- **Pace (FR-ACAD.4) is computed, never fabricated** (`src/lib/academic.ts`):
  AT RISK = ungraded item due/overdue OR target mathematically unreachable
  at 100% on remaining weight; TIGHT = needs > 85% avg on remaining; the
  `basis` string (shown in the UI) states the exact arithmetic, weights
  coverage, and which inputs are missing.

### Work module → core mapping (hub-and-spoke, no private tables)

- **Projects are Events** (`domain=work`, `kind=deadline`,
  `payload.work="project"`, start = the deadline) → VISIBLE on the unified
  calendar, unlike other modules' definition Events. A project's `goal_id`
  points at its project Goal; **next actions are ordinary Tasks** whose
  `goal_id` is that goal (the Work page derives "Next:" + done/total from
  them — FR-WORK.2).
- **Achievements are Events** (`kind=other`, `payload.work="achievement"`,
  context in payload) — log entries, so `calendarVisible` excludes exactly
  that discriminator value. Export is a client-side clipboard copy of plain
  text (`achievementsText` in `src/lib/work.ts`), one line per win.
- **Time tracking is a Metric per project** (`<title> hours`, FR-WORK.4):
  each quick-duration tap or timer stop APPENDS a datapoint sourced
  `work:<projectId>` — entries are additive facts, never replaced (unlike
  the net-worth/grade daily recomputes). The project payload caches
  `metricId` (rename-safe) and `timerStartedAt` (running start/stop timer).
- Career goals panel = work-domain goals via the engine (FR-WORK.1), same
  reuse rule as Academic.

### AI layer → boundary rules (Phase 4 steps 1–3, NFR-1 + FR-AI)

- **`src/lib/ai/` is the ONLY path to the LLM API.** `context.ts` assembles
  structured SUMMARIES (module computations, capped lists, no DB ids — the
  verify suite asserts zero UUIDs); `request.ts` is the pure builder of the
  exact request body (model `claude-opus-4-8`, `buildAiRequest` +
  `buildChatRequest`); `client.ts` is the sole transport — `server-only`,
  reads `ANTHROPIC_API_KEY` inside the send call, and is the one file allowed
  to import `@anthropic-ai/sdk` (enforced by a `no-restricted-imports` lint
  rule). Never call the API any other way; all chat context still flows
  through `assembleContext`.
- **Raw journal body text is EXCLUDED by default** — journal contributes
  mood/energy/tags only. Body text requires the caller's explicit per-feature
  `includeJournalText: true`; the payload records the decision in
  `meta.journalTextIncluded`. `npm run test:ai` asserts both directions.
- **The model CANNOT write. Ever.** It has no write tool — when it wants to
  change data it emits a `propose_changes` tool call (plain JSON wired to
  nothing). `proposals.ts` parses that into typed proposals by building clean
  objects from an allowlist (never spreads the raw input); the chat UI renders
  each as a review card (a `+` field diff) with Approve / Reject. Only on
  Approve does the `applyProposalAction` server action call `apply.ts`, which
  **re-validates the payload from scratch** and writes through the SAME
  forUser create functions as a manual edit. Reject / no-action = `apply.ts`
  is never called. `npm run test:assistant` asserts: proposing writes zero
  rows, hostile payloads bounce at apply, an approved write goes through the
  normal validated path.
- **The daily nudge (FR-AI.3) is advisory + cached.** `lib/ai/nudge.ts`
  generates one line via `buildAiRequest(ctx, "daily-nudge")` — NO tools, so
  it can only return text (FR-AI.4: it never writes; acting on it means the
  "Discuss →" link into chat). Cost (NFR-5 — this is LLM spend, which is real
  and ongoing; NOT a platform quota, see Infrastructure): today's nudge is cached as an
  Event (`payload.nudge = {date, text}`, one per day, `calendarVisible`
  excludes it); the dashboard build only READS the cache (never calls the
  API), and the banner fires the generate action client-side once per day —
  `generateDailyNudgeAction` short-circuits on a cache hit before the API.
  Disableable via a preference Event (`payload.pref`, default ON, excluded
  from the calendar); the Settings toggle flips it. `npm run test:nudge`
  asserts cache/one-per-day, no-tools, journal exclusion, toggle, and
  calendar exclusion.
- **`/settings/ai-preview` renders the exact request body** without sending;
  keep it truthful: it must go through the same `assembleContext` +
  `buildAiRequest` path as any real send. `/assistant` and the nudge gate on
  the key being configured (`aiConfigured()` — the sole reader stays
  client.ts; callers ask that helper, never `process.env` directly).
- **Chat is streamed and persisted.** `streamFromClaude` (still inside
  `client.ts`, the sole SDK importer) yields plain text deltas over
  `POST /api/assistant/chat` (SSE); the route owns persistence — it stores
  the user turn before calling the model and the assistant turn (verbatim
  content blocks, including any `propose_changes` tool call) when the stream
  ends, so a completed reply is never lost. **`conversations` /
  `conversation_messages` are a deliberate, owner-directed EXCEPTION to
  "modules own no private tables"** (§5.1) — a chat transcript has no domain
  semantics, never belongs on the calendar, and isn't a life-domain object,
  so modelling it as Events would abuse the core; it sits beside the core
  like backup files do. Owner-only RLS + `forUser` like every other table,
  and included in the NFR-4 export (`lib/backup.ts`). Resuming a
  conversation replays it through `buildReplayTurns` (`lib/ai/replay.ts`),
  which feeds the model a `tool_result` per past proposal stating exactly
  what the owner decided — a resumed chat can never believe an unapplied or
  rejected proposal went through, and nothing is ever re-applied on
  reload. Delete is archive-then-purge, same soft-delete convention as
  tasks/habits (`purgeConversation` refuses a non-archived row). Storing
  history in the owner's own database does **not** widen the outbound
  boundary — `assembleContext` is still the only thing that decides what
  reaches the API. `npm run test:chat` asserts persistence/reload/resume,
  export inclusion, and that the boundary + journal exclusion are unchanged.

### Review system → core mapping (§8.10, no private tables)

- **The review is the smart layer, not a data type**: the weekly summary and
  goal review are COMPUTED live from the other modules' own computations
  (task lists, habit adherence, gym adherence, budget vs actual, academic
  study/pace, work hours/wins, journal, goal engine). Every figure carries a
  `basis` string shown in the UI; missing inputs render "—", never a guess
  (`src/lib/data/review.ts`).
- **Saved reviews are Events** (`domain=personal`, `kind=other`,
  `payload.rev = {type, periodKey, stats, highlights, goals, reflections}`)
  — POINT-IN-TIME snapshots recomputed server-side at save, then rendered
  as stored forever (history never rewrites). `calendarVisible` excludes the
  `rev` key. One review per (type, period): re-saving replaces.
- **FR-REV.2 flags**: `at-risk` (academic pace via the course's goal),
  `overdue` (target date passed, pct < 100), `no-signal` (no linked
  metric/habits/milestones/savings), each with a `flagBasis`; flagged rows
  link to the goal's edit page for adjust/abandon.
- Timeline notes derive from STORED snapshots (`timelineNote` in
  `src/lib/review.ts`); `/review/[id]` renders a snapshot as saved.

### Goal engine → core mapping (§8.2, no private tables)

- **Goals nest** via `parent_goal_id` (milestones = child goals). **Cross-
  domain links** use the §7.7 Link table with `from_type`/`to_type` and a
  relation (`funds|supports|blocks|relates-to`).
- **Progress is computed, never fabricated**: a goal's % is the mean of real
  signals — child-goal rollup (milestones), linked-Habit adherence
  (`habit.goal_id`), linked-Metric value vs a target parsed from the goal's
  title/success text (Link `metric —relates-to→ goal`), and funding-savings
  progress. `basis` records which signal drove it. See `src/lib/data/goals.ts`.
- Habits attach to a goal via `habit.goal_id`; metrics via a `relates-to`
  Link. All queries go through `forUser`.

## Product principles (spec §5)

1. **Hub and spoke.** Modules are **thin views over a small unified core.
   Modules do not own private data types.** Every module reduces its concepts
   to core objects: a gym session is an Event with Metrics attached; a budget
   target is a Goal with a linked Metric; an exam is an Event linked to an
   academic Goal. Unified calendar and cross-domain insight must never require
   per-module integration work. Never add a module-private table.
2. **Capture is sacred.** Every logging flow is optimised before any analytics
   flow. Target: any log (task, habit tick, event) in under 10 seconds.
3. **Manual before automatic.** No integrations until the manual version proves
   the module earns its place.
4. **The Today view is the product.** Every feature must justify itself by
   improving today's decisions or this week's review.
5. **Reviews make it compound.** The system nudges reflection, not just storage.

## Core data model (spec §7 — implement in full)

All entities carry: `id`, `domain` (`personal | academic | work | finance |
gym | health`), `created_at`, `updated_at`, `archived`.

### Goal (§7.1)
- `title`, `description`
- `horizon`: `life | yearly | quarterly | monthly`
- `parent_goal_id` (nullable — goals nest)
- `target_date` (nullable)
- `status`: `active | achieved | abandoned | paused`
- `success_criteria` (text)
- Linked milestones (child goals), recurring actions (Habits), progress Metrics.

### Task (§7.2)
- `title`, `notes`, `due_date`, `priority` (1–3), `status` (`open | done | dropped`)
- `goal_id` (nullable), `event_id` (nullable)
- `recurrence` rule (nullable)

### Habit (§7.3)
- `title`, `schedule` (e.g. daily, Mon/Wed/Fri, 3×/week)
- `goal_id` (nullable)
- Completion log (date, done/skipped) with computed streak and adherence %.

### Event (§7.4)
- `title`, `start`, `end`, `all_day`
- `kind`: `appointment | deadline | session | bill | birthday | other`
- `goal_id` (nullable)
- Payload by kind (e.g. a gym session Event stores exercises → sets → reps →
  weight).

### Metric (§7.5)
- `name` (e.g. weight, sleep hours, squat 1RM, net worth, GPA, category spend)
- `unit`, `direction` (`higher-better | lower-better | target-range`)
- Time-series datapoints (`timestamp`, `value`, optional `source`)

### Journal entry (§7.6)
- `date`, `body` (markdown), `mood` (1–5, optional), `energy` (1–5, optional),
  `tags`

### Link (§7.7)
- `from_id`, `to_id`, `relation` (`funds | supports | blocks | relates-to`)
- Enables cross-domain structure, e.g. savings Goal —funds→ life Goal.

## Tech stack (spec §10 + decisions)

| Layer | Choice |
|---|---|
| Frontend | **Next.js (App Router)** as an installable, mobile-first **PWA** |
| Styling | **Tailwind CSS**, hand-rolled components (no component library — see design system) |
| Backend/DB | **Supabase, self-hosted** (PostgreSQL, auth, storage) |
| ORM | **Drizzle** (decided; not Prisma) |
| Charts | **Recharts** |
| AI (Phase 4) | **Anthropic API** (decided; not OpenAI), structured data as context |
| Hosting | **Self-hosted on Coolify** (Nixpacks build) — see Infrastructure |

Non-functional constraints to respect from the first commit: dashboard <1s load
on mobile (NFR-3, FR-DASH.3), optimistic UI on logging interactions, all
logging flows usable one-handed on a phone (NFR-2), nightly backup/export path
(NFR-4), only minimal structured summaries ever sent to the LLM API and raw
journal text excluded by default (NFR-1).

## Infrastructure — self-hosted (supersedes spec §10 hosting + NFR-5)

The spec's "Vercel + Supabase free tiers, zero ops" is **historical**. Both
now run on the owner's own server:

| Piece | Reality |
|---|---|
| App | **Coolify**, built with **Nixpacks** (no Dockerfile in this repo) |
| Supabase | **Self-hosted via Coolify** — own Postgres, auth (GoTrue), storage |
| Scheduled jobs | **Coolify Scheduled Tasks** hitting secret-protected routes |

### Scheduled jobs

Cron lives in **Coolify Scheduled Tasks**, not `vercel.json`. A task is just a
scheduled HTTP call to a route that authorizes a shared secret
(`Authorization: Bearer $CRON_SECRET`), the same door the signed-in owner can
open with a session cookie. Current + planned jobs: the nightly backup
(NFR-4) and CalDAV sync. Add a scheduled job by adding the route + the secret
check, then registering it in Coolify — never by adding platform cron config
to the repo.

### ⚠️ Vercel-era constraints are GONE — do not design around them

Several earlier decisions were shaped by limits that **no longer exist**. Do
not reintroduce them, and do not accept a premise from a future prompt that
assumes them:

- **No serverless function duration cap.** Long-running work (a full export,
  a bulk sync, a slow AI call) no longer has to be split, streamed early, or
  deferred to fit a 10s/60s ceiling. `maxDuration` hints are inert here.
- **No once-daily cron limit** (the Vercel Hobby restriction). Jobs may run
  as often as the work actually warrants — hourly sync is fine.
- **No per-invocation / bandwidth metering, no cold starts.** A persistent
  server process is available; background work and in-process caching are
  legitimate options now, where before everything had to be stateless.
- **No platform-imposed DB row/storage caps**, since Postgres and storage are
  the owner's own.

### Cost (NFR-5, restated)

NFR-5's "runs within free/hobby tiers (~$0/month)" framing is superseded: the
cost is now **the server itself** — a fixed monthly box, plus Anthropic API
usage. Platform tier limits are no longer a design input. What remains true
is the *spirit* of NFR-5: don't burn money for no reason. The daily-nudge
cache (one API call per day, §FR-AI.3) stays cached because LLM calls still
cost real money — not because a platform quota demands it.

**Ops the owner now owns** (previously the platform's job): backups of the
Postgres volume itself, TLS/cert renewal, Supabase version upgrades, and disk
headroom. The app-level nightly export (NFR-4) is a *logical* backup and is
not a substitute for volume-level backups.

### Persistent storage — REQUIRED, and ⚠️ NOT YET VERIFIED

Postgres data and Supabase Storage objects **must** live on persistent
volumes (named Docker volumes or host bind mounts), never on a container's
writable layer. Coolify recreates containers on every redeploy: anything in
the writable layer is destroyed silently, so an unmounted data directory
means the database is one deploy away from gone.

- Postgres data dir: `/var/lib/postgresql/data`
- Supabase Storage (file backend): `/var/lib/storage`

**This has not been confirmed.** Nothing in this repo describes the
deployment — there is no compose/Coolify config here, and `.env.local`
points at the local Supabase CLI stack (`127.0.0.1:54321`), not the server.
It is recorded here as a requirement, not a verified fact. To check, on the
Coolify host:

```sh
docker ps --format '{{.Names}}' | grep -iE 'db|postgres|storage'
# for each: a Type of "volume" or "bind" is good; NO row for the data dir is the bug
docker inspect -f '{{range .Mounts}}{{.Type}}  {{.Source}} -> {{.Destination}}{{println}}{{end}}' <container>
```

Once verified, replace this block with the finding and the date. (If Storage
is configured with the S3 backend rather than the file backend, the
`/var/lib/storage` mount is moot — note which backend is in use.)

## Design system (from `docs/design/Helm.dc.html`)

The mockup defines a **flat, dense, utilitarian** aesthetic — closer to a
terminal dashboard than a consumer app. Reproduce it faithfully.

### Hard rules
- **No border-radius. No shadows. No gradients.** Everything is rectangles with
  1px borders.
- **Light theme only** (no dark mode in the mockup or spec).
- Checkmarks/dots/swatches are **squares**, never circles.
- Done/completed items: `line-through` + opacity ~0.45–0.5, never removed from
  the list.

### Palette
| Token | Value | Use |
|---|---|---|
| Background | `#f2f2ee` | page body |
| Surface | `#ffffff` | cards/panels, header |
| Ink | `#1a1a18` | text, primary buttons, checked states, active nav |
| Inverse text | `#f2f2ee` | text on ink backgrounds |
| Border (outer) | `#d9d9d2` | card borders, header rule |
| Border (panel header) | `#e5e5de` | divider under panel headers |
| Border (rows) | `#efefe8` | row separators inside panels |
| Muted text | `#6e6e66` | secondary values |
| Faint text | `#8b8b80` | labels, metadata |
| Faintest text | `#a3a39a` | footer, disclaimers |
| Input bg / subtle bg | `#fafaf6` | inputs, secondary buttons |
| Input border | `#c9c9c0` | inputs, chips |
| Track / inactive bar | `#ecece5` / `#c9c9c0` | progress-bar tracks, non-current chart bars |

### Domain colours (oklch — used for dots, calendar coding, progress fills)
```
personal: oklch(0.55 0.09 200)   academic: oklch(0.55 0.09 285)
work:     oklch(0.55 0.09 250)   finance:  oklch(0.55 0.10 150)
gym:      oklch(0.62 0.13 55)    health:   oklch(0.55 0.13 20)
```

### Status colours
- Good/on-track: `oklch(0.5–0.55 0.10 150)` (green)
- Warning/near-cap: `oklch(0.62 0.13 55)` (amber)
- Bad/over/at-risk: `oklch(0.55 0.13 20)` (red)
- Budget-style thresholds in the mockup: green → amber above ~88% → red above 100%.

### Typography
- Body: `13px/1.45 "Helvetica Neue", Helvetica, Arial, sans-serif`, with
  `font-variant-numeric: tabular-nums` globally.
- All labels, metadata, numbers, timestamps, and buttons use
  `ui-monospace, Menlo, monospace`.
- Panel/section labels: `600 10px` monospace, UPPERCASE,
  `letter-spacing: .08em`, colour `#8b8b80`.
- Content rows: 12–12.5px; big stat numbers: `600 26px` monospace.
- Links: underlined, `text-underline-offset: 2px`.

### Layout & components
- Content container: `max-width: 1280px`, centered, 16px padding.
- Panel grids: CSS grid `repeat(auto-fit, minmax(~320px, 1fr))`, 12px gap.
- **Panel** = white card, 1px `#d9d9d2` border, header row (`10px 12px`
  padding, `#e5e5de` bottom border) with an uppercase mono label left and a
  muted mono count/value right.
- **Rows** inside panels: `8px 12px` padding, `#efefe8` bottom border, baseline-
  aligned flex with a 7px square domain dot.
- **Check button**: 16px square (20px in dense logging contexts), `1.5px solid
  #1a1a18`; checked = `#1a1a18` fill with white `✓`.
- **Primary button**: `#1a1a18` bg, white text, `600 11px` monospace UPPERCASE,
  `letter-spacing: .06em`, no border.
- **Inputs/selects**: `1px solid #c9c9c0`, `#fafaf6` bg; numeric inputs use
  monospace and `inputMode="decimal"`.
- **Progress bars**: 4px tall, track `#ecece5`, fill = domain or status colour.
- **Header**: white bar with `HELM` mono wordmark + version chip, a mono
  key-stats strip, and the date; nav is a horizontally scrollable row of
  UPPERCASE mono tabs where the active tab gets a 2px `#1a1a18` bottom border
  and ink text (inactive: `#8b8b80`).
- **Assistant nudge banner** (Phase 4): inverted — `#1a1a18` bg, `#f2f2ee`
  text (do not build now).
- Priority badges: bordered mono chips like `P1`; streaks shown as `×23`.
- **Segmented control** (sub-view switch): a row of mono UPPERCASE buttons at
  the top of a merged tab, active = ink fill + white text, inactive =
  `#fafaf6` bg + `#c9c9c0` border. Same rectangles-only rules as everything
  else. Carries `data-segmented` + `data-no-swipe`.

### Primary navigation — 6 tabs (restructured 2026-07-20)

Home icon · **DAILY · CALENDAR · ACADEMIC & WORK · GYM · FINANCE ·
ASSISTANT** · Settings gear. The gear sits in the header's top row next to
Sign out, not in the tab row. **Goals is deliberately NOT a tab** — it stays
a real route (`/goals`) reached from the dashboard's Goals card
("All goals →") and every module's goal rows.

Three tabs merge two views behind a segmented control. The merge is
**presentational only** — each sub-view keeps its own filters, forms and
empty states; never blend them into one unified list:

| Tab | Segments | Routes |
|---|---|---|
| Daily | Tasks · Habits | `/tasks` · `/habits` |
| Academic & Work | Academic · Work | `/academic` · `/work` |
| Assistant | Chat · Reviews | `/assistant` · `/review` |

**Every pre-existing route still resolves** — the restructure only changed
what nav links to, so deep links, detail pages and bookmarks are unaffected.

`lib/tab-data.ts` is the single source of truth for the track: `TRACK_TABS`
lists the six tabs, each with its `views[]`. **The swipe track's unit is the
TAB, not the view** — a swipe moves tab-to-tab and lands on whichever segment
that tab was last left on; the segmented control switches within a tab
without moving the track. `buildInitialTrio` fetches every segment of the
landing tab and both neighbours, so neither a swipe nor a segment flip can
land on a skeleton. Assistant's two segments are separate ROUTES (not track
members) because the chat owns resumable `?c=…` URLs that a pushState shell
would fight.

## Working agreements

- **No app code has been written yet.** The repo currently contains only the
  spec and design docs. When implementation starts, it is Phase 1 scope only.
- Full §7 schema ships in Phase 1 via Drizzle migrations; deferred-module UIs
  do not.
- Sign-up stays disabled; never build multi-user features (NG1).
- Keep the mockup (`docs/design/Helm.dc.html`) as the visual reference for
  every screen; open questions live in spec §13.

RLS bypass rule: server-side Drizzle connects as `postgres` and BYPASSES RLS. Every
Drizzle query that reads or writes user-scoped tables MUST filter by the session user's
id explicitly — RLS does not protect this path. Prefer a single helper (e.g. a
`db.forUser(userId)` wrapper or a required `userId` arg on all data functions) so the
filter can't be forgotten. Treat a user-scoped query without a user_id filter as a bug.