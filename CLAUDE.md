# CLAUDE.md — LifeOS

Guidance for Claude Code when working in this repository. Source of truth:
`docs/lifeos-spec.md` (product spec v0.1) and `docs/design/LifeOS.dc.html`
(interactive design mockup). If this file and the spec disagree, the spec wins —
then update this file.

## What LifeOS is

LifeOS is a **private, single-user web app** that acts as an operating system for
the owner's life. It unifies personal admin, academic planning, work/career,
finance, gym, and health into one application built on a **shared data model**,
with a daily dashboard, a universal goal engine, a structured review system, and
an AI assistant layer on top.

> One-liner: a personal life dashboard that knows everything about your goals,
> plans, and habits — and acts like an assistant, not just a tracker.

The value is not any individual module; it is the **cross-domain intelligence**
and the **review cadence** that are only possible when everything lives in one
system. Single tenant, no sharing, no monetisation (spec §3 non-goals).

## ⚠️ Current scope: PHASES 1–2 done + PHASE 3 in progress

Phase 1 ("Spine") is complete. **Phase 2 is complete** (owner-directed): the
**Gym module** (§8.8), **Finance module** (§8.7), and **universal goal
engine** (§8.2) are all built. The goal engine wired the savings-goal `funds→`
life-goal Links that Finance had stubbed. **Phase 3 is in progress**
(owner-directed): the **Academic module** (§8.5) and **Work module** (§8.6)
are built; the review system is not started. The Phase-1 scope below stays
as the baseline the app must keep satisfying.

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
| Review system (weekly/monthly reviews, timeline) | 3 |
| AI assistant (chat, plans, daily nudge) | 4 |
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
| Backend/DB | **Supabase** (PostgreSQL, auth, storage) |
| ORM | **Drizzle** (decided; not Prisma) |
| Charts | **Recharts** |
| AI (Phase 4) | **Anthropic API** (decided; not OpenAI), structured data as context |
| Hosting | Vercel + Supabase free/hobby tiers (~$0/month, NFR-5) |

Non-functional constraints to respect from the first commit: dashboard <1s load
on mobile (NFR-3, FR-DASH.3), optimistic UI on logging interactions, all
logging flows usable one-handed on a phone (NFR-2), nightly backup/export path
(NFR-4), only minimal structured summaries ever sent to the LLM API and raw
journal text excluded by default (NFR-1).

## Design system (from `docs/design/LifeOS.dc.html`)

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
- **Header**: white bar with `LIFEOS` mono wordmark + version chip, a mono
  key-stats strip, and the date; nav is a horizontally scrollable row of
  UPPERCASE mono tabs where the active tab gets a 2px `#1a1a18` bottom border
  and ink text (inactive: `#8b8b80`).
- **Assistant nudge banner** (Phase 4): inverted — `#1a1a18` bg, `#f2f2ee`
  text (do not build now).
- Priority badges: bordered mono chips like `P1`; streaks shown as `×23`.

## Working agreements

- **No app code has been written yet.** The repo currently contains only the
  spec and design docs. When implementation starts, it is Phase 1 scope only.
- Full §7 schema ships in Phase 1 via Drizzle migrations; deferred-module UIs
  do not.
- Sign-up stays disabled; never build multi-user features (NG1).
- Keep the mockup (`docs/design/LifeOS.dc.html`) as the visual reference for
  every screen; open questions live in spec §13.

RLS bypass rule: server-side Drizzle connects as `postgres` and BYPASSES RLS. Every
Drizzle query that reads or writes user-scoped tables MUST filter by the session user's
id explicitly — RLS does not protect this path. Prefer a single helper (e.g. a
`db.forUser(userId)` wrapper or a required `userId` arg on all data functions) so the
filter can't be forgotten. Treat a user-scoped query without a user_id filter as a bug.