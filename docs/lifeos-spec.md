# LifeOS — Product Specification

| | |
|---|---|
| **Version** | 0.1 (draft) |
| **Date** | 14 July 2026 |
| **Status** | For review |
| **Type** | Personal web application (single user) |

---

## 1. Summary

LifeOS is a private, single-user webapp that acts as an operating system for the owner's life. It unifies personal admin, academic planning, work/career, finance, gym, and health into one application built on a shared data model, with a daily dashboard, a universal goal engine, a structured review system, and an AI assistant layer on top.

**One-liner:** A personal life dashboard that knows everything about your goals, plans, and habits — and acts like an assistant, not just a tracker.

## 2. Problem statement

Life data is currently fragmented across single-purpose apps (calendar, budgeting, workout logger, notes, to-do list). This causes three problems:

1. No single place to see "today" or "this week" across all life domains.
2. No connection between domains — savings aren't linked to life goals, sleep isn't linked to training, study plans aren't checked against the work calendar.
3. Long-term goals live in nobody's app, so they are set once and never reviewed.

The value of LifeOS is not any individual module; it is the cross-domain intelligence and the review cadence that are only possible when everything lives in one system.

## 3. Goals and non-goals

### Goals
- G1. One daily dashboard that replaces opening 5–6 separate apps each morning.
- G2. A single goal framework that spans every life domain and rolls up to one "life direction" view.
- G3. Frictionless logging (task, expense, workout set, weight, journal entry) in under 10 seconds each.
- G4. A weekly review that takes ≤10 minutes and is partly auto-generated.
- G5. An AI assistant that can answer questions and generate plans using the owner's own data.
- G6. Ship a daily-usable version within weeks, not months (see roadmap).

### Non-goals (v1)
- NG1. Multi-user support, sharing, or social features.
- NG2. Native mobile apps (PWA covers mobile).
- NG3. Automatic bank/health integrations (manual entry first; integrations are Phase 4).
- NG4. Replacing specialist tools at full depth (e.g. full double-entry accounting, periodised coaching plans).
- NG5. Monetisation or productisation.

## 4. Target user

The owner: a single individual managing study, work, money, training, and health simultaneously. Assumed comfortable with web apps and willing to log data manually if logging is fast. The architecture should remain single-tenant-friendly so productisation stays possible later, but no v1 decision may add friction to serve that possibility.

## 5. Product principles

1. **Hub and spoke.** Modules are thin views over a small unified core. Modules do not own private data types.
2. **Capture is sacred.** Every logging flow is optimised before any analytics flow.
3. **Manual before automatic.** Integrations only after the manual version proves the module earns its place.
4. **The Today view is the product.** Every feature must justify its presence by improving today's decisions or this week's review.
5. **Reviews make it compound.** The system nudges reflection; it does not just store data.

## 6. Architecture overview

Three layers:

1. **Life modules (input/views):** Personal, Academic, Work, Finance, Gym, Health.
2. **Unified core (data model):** Goals, Tasks, Habits, Events, Metrics, Journal entries — plus Links between any two objects.
3. **Smart layer (output):** Today dashboard, unified calendar, review system, AI assistant.

Every module reduces its concepts to core objects. Examples: a gym session is an Event with Metrics attached; a budget target is a Goal with a linked Metric; an exam is an Event linked to an academic Goal. Unified calendar and cross-domain insight therefore require no per-module integration work.

## 7. Core data model

All entities carry: `id`, `domain` (personal | academic | work | finance | gym | health), `created_at`, `updated_at`, `archived`.

### 7.1 Goal
- `title`, `description`
- `horizon`: life | yearly | quarterly | monthly
- `parent_goal_id` (nullable — goals nest)
- `target_date` (nullable)
- `status`: active | achieved | abandoned | paused
- `success_criteria` (text)
- Linked milestones (child goals), recurring actions (Habits), and progress Metrics.

### 7.2 Task
- `title`, `notes`, `due_date`, `priority` (1–3), `status` (open | done | dropped)
- `goal_id` (nullable), `event_id` (nullable)
- `recurrence` rule (nullable)

### 7.3 Habit
- `title`, `schedule` (e.g. daily, Mon/Wed/Fri, 3×/week)
- `goal_id` (nullable)
- Completion log (date, done/skipped) with computed streak and adherence %.

### 7.4 Event
- `title`, `start`, `end`, `all_day`
- `kind`: appointment | deadline | session | bill | birthday | other
- `goal_id` (nullable)
- Payload by kind (e.g. a gym session Event stores exercises → sets → reps → weight).

### 7.5 Metric
- `name` (e.g. weight, sleep hours, squat 1RM, net worth, GPA, category spend)
- `unit`, `direction` (higher-better | lower-better | target-range)
- Time-series datapoints (`timestamp`, `value`, optional `source`)

### 7.6 Journal entry
- `date`, `body` (markdown), `mood` (1–5, optional), `energy` (1–5, optional), `tags`

### 7.7 Link
- `from_id`, `to_id`, `relation` (funds | supports | blocks | relates-to)
- Enables cross-domain structure, e.g. savings Goal —funds→ life Goal.

## 8. Functional requirements

Requirements are numbered `FR-<module>.<n>`. "Must" = required for the phase in which the module ships.

### 8.1 Today dashboard (DASH)
- FR-DASH.1 Show, on one screen: today's Events (all domains), top 3 Tasks, today's Habit checklist, current budget status, planned workout, and one assistant nudge.
- FR-DASH.2 Every item is actionable inline (complete task, tick habit, open event) without navigation.
- FR-DASH.3 Loads in <1s on mobile; this screen is the app's home route.

### 8.2 Universal goal engine (GOAL)
- FR-GOAL.1 Create goals in any domain with the same structure: outcome → milestones → recurring actions → linked metrics.
- FR-GOAL.2 A single "Goals" page shows all active goals across domains, grouped by horizon.
- FR-GOAL.3 Goal detail shows progress from linked Metrics and adherence from linked Habits.
- FR-GOAL.4 Goals can nest (life → yearly → quarterly) and link across domains (§7.7).

### 8.3 Unified calendar (CAL)
- FR-CAL.1 Month/week/day views rendering all Events regardless of domain, colour-coded by domain.
- FR-CAL.2 Deadlines, bills, and birthdays appear alongside appointments and sessions.

### 8.4 Personal (PERS)
- FR-PERS.1 Task list with due dates, priorities, and recurrence.
- FR-PERS.2 Habit tracker with streaks and adherence %.
- FR-PERS.3 Journal with daily entries, mood/energy check-in, and search.
- FR-PERS.4 Important-dates register (birthdays, renewals) generating recurring Events.

### 8.5 Academic (ACAD)
- FR-ACAD.1 Define 1–5 year academic direction as a life-horizon Goal with nested semester/course goals.
- FR-ACAD.2 Track courses with assessments (weight, due date, grade) as Events + Metrics.
- FR-ACAD.3 Log study sessions; show planned vs actual study hours per course/week.
- FR-ACAD.4 Pace indicator: given remaining assessments and current grades, flag goals at risk.

### 8.6 Work (WORK)
- FR-WORK.1 Career goals and skill-development plans using the goal engine.
- FR-WORK.2 Track current projects with deadlines and next actions.
- FR-WORK.3 Achievements log (dated wins with context) exportable as text for CVs/reviews.
- FR-WORK.4 Optional lightweight time tracking per project.

### 8.7 Finance (FIN)
- FR-FIN.1 Accounts with balances; computed net-worth Metric over time.
- FR-FIN.2 Monthly budgets by category; expense logging in ≤10 seconds; budget vs actual view.
- FR-FIN.3 Savings goals with progress bars, linkable (funds→) to life goals.
- FR-FIN.4 Recurring bills/subscriptions register generating Events and reminders.

### 8.8 Gym (GYM)
- FR-GYM.1 Create workout programs/templates (exercise list with target sets/reps).
- FR-GYM.2 Log sessions against a template: per-exercise sets, reps, weight; pre-fill from last session.
- FR-GYM.3 Track PRs and estimated 1RMs per lift; progress charts.
- FR-GYM.4 Adherence view: planned vs completed sessions per week.

### 8.9 Health (HLTH)
- FR-HLTH.1 Log weight/measurements, sleep hours, and optional nutrition notes as Metrics.
- FR-HLTH.2 Medications and medical appointments as Events with reminders.
- FR-HLTH.3 Mood/energy sourced from journal check-ins; trend charts.

### 8.10 Review system (REV)
- FR-REV.1 Guided weekly review (≤10 min): auto-generated summary of the week (completions, adherence, spend, training, journal highlights), prompts for reflection, and next week's top 3 per domain.
- FR-REV.2 Monthly/quarterly review against goals: progress per goal, at-risk flags, and prompt to adjust or abandon.
- FR-REV.3 Reviews are stored and browsable as a timeline.

### 8.11 AI assistant (AI)
- FR-AI.1 Chat interface with the owner's structured data (goals, upcoming events, budgets, metrics summaries) provided as context.
- FR-AI.2 Capabilities: answer questions ("can I afford X in March given my savings goals?"), generate plans (study plan around the work calendar), and draft the weekly review summary.
- FR-AI.3 Daily nudge on the dashboard: one short, data-grounded suggestion or flag (e.g. correlation between short sleep and skipped workouts).
- FR-AI.4 Assistant output is advisory only; it never mutates data without explicit confirmation.

## 9. Non-functional requirements

- NFR-1 **Privacy.** Single-tenant; data stored in the owner's own database. Only minimal structured summaries are sent to the LLM API; raw journal text excluded by default (opt-in per feature).
- NFR-2 **Mobile-first PWA.** Installable, responsive; all logging flows usable one-handed on a phone.
- NFR-3 **Performance.** Dashboard <1s load; logging interactions feel instant (optimistic UI).
- NFR-4 **Durability.** Nightly automated backup/export of the full database (e.g. JSON/CSV dump).
- NFR-5 **Cost.** Runs within free/hobby tiers (~$0/month excluding LLM API usage).
- NFR-6 **Auth.** Single-account login sufficient; still enforce standard session security since financial and health data are stored.

## 10. Tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js (App Router) as a PWA, Tailwind CSS + component library | One codebase for desktop + mobile; fast to build |
| Backend/DB | Supabase (PostgreSQL, auth, storage) with Drizzle or Prisma | Bundles auth + Postgres + backups; free tier |
| Charts | Recharts | Simple progress/trend charts |
| AI | Anthropic or OpenAI API, structured data passed as context | Powers FR-AI.* |
| Hosting | Vercel + Supabase | Free tiers, zero ops |
| Integrations (Phase 4) | Google Calendar API; Basiq (AU bank aggregation); phone/watch health export | Deferred by design |

## 11. Roadmap

| Phase | Scope | Done when |
|---|---|---|
| **1 — Spine** (2–4 wks) | Auth, core data model, Today dashboard, Tasks, Habits, unified calendar | Owner uses it every morning instead of separate to-do + calendar apps |
| **2 — First modules** | Gym + Finance, universal goal engine | All workouts and expenses logged in-app for 2 consecutive weeks; goals page live |
| **3 — Direction** | Academic + Work modules, review system | First full weekly review completed in-app; semester plan entered |
| **4 — Intelligence** | AI assistant + nudges; then external integrations (calendar sync, bank feeds, health import) | Assistant answers cross-domain questions correctly against real data |

Each phase ships to production; no phase begins until the previous one is in daily use.

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Scope creep — six mediocre modules, none finished | Hub-and-spoke core + strict phase gates (§11); modules are thin views |
| Logging fatigue kills adoption | ≤10-second capture flows (G3); pre-fill from history; cut any field that isn't used in a review |
| Integrations stall the project | Manual-first principle; integrations isolated to Phase 4 |
| AI features leak sensitive data | NFR-1: summaries only, journal opt-in, advisory-only assistant (FR-AI.4) |
| Motivation decay | Phase 1 must be daily-usable in weeks; review system creates a recurring reason to return |

## 13. Open questions

1. Should nutrition tracking be numeric (calories/macros) or notes-only in v1? (Numeric adds heavy logging cost.)
2. Weekly review day/time and notification channel (email vs PWA push)?
3. Does Work time-tracking (FR-WORK.4) earn its place, or defer to Phase 4?
4. Data export format for backups — single JSON dump vs per-entity CSVs?

## 14. Success metrics

- Dashboard opened ≥6 days/week after Phase 1.
- ≥90% of workouts and ≥90% of expenses captured in-app after Phase 2.
- Weekly review completed ≥3 weeks out of 4 after Phase 3.
- At least one goal adjusted or abandoned per quarter as a direct result of a review (evidence the system informs decisions, not just records them).
