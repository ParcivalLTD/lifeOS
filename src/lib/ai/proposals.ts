/**
 * CONFIRMED-ACTION proposals (Phase 4 step 2). The model has NO write path:
 * when it wants to change data it emits a `propose_changes` tool call whose
 * input is parsed HERE into typed proposals — data to render, not an action.
 * Writes happen only in `apply.ts`, only after the owner taps Approve, and
 * only after this module re-validates the payload from scratch.
 *
 * Validation builds CLEAN objects field by field from an allowlist — the raw
 * input (model- or client-supplied) is never spread or trusted. Pure module:
 * no DB imports, no I/O.
 */
import type { HabitSchedule } from "@/db/schema";
import { isValidISODate } from "@/lib/dates";
import { isDomain, type Domain } from "@/lib/domains";
import { isEventKind, type EventKind } from "@/lib/event-utils";

export type TaskProposal = {
  action: "create_task";
  title: string;
  domain: Domain;
  dueDate: string | null;
  priority: 1 | 2 | 3;
};

export type EventProposal = {
  action: "create_event";
  title: string;
  domain: Domain;
  kind: EventKind;
  date: string;
  time: string | null;
  endTime: string | null;
};

export type HabitProposal = {
  action: "create_habit";
  title: string;
  domain: Domain;
  schedule: HabitSchedule;
};

export type Proposal = TaskProposal | EventProposal | HabitProposal;

export type ParseResult =
  | { ok: true; proposal: Proposal }
  | { ok: false; error: string };

const MAX_TITLE = 200;
const MAX_PROPOSALS = 10;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const rec = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const cleanTitle = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  return t.length >= 1 && t.length <= MAX_TITLE ? t : null;
};

const cleanDomain = (v: unknown): Domain | null =>
  typeof v === "string" && isDomain(v) ? v : null;

const cleanDate = (v: unknown): string | null =>
  typeof v === "string" && isValidISODate(v) ? v : null;

const cleanTime = (v: unknown): string | null =>
  typeof v === "string" && TIME_RE.test(v) ? v : null;

const cleanSchedule = (v: unknown): HabitSchedule | null => {
  const s = rec(v);
  if (!s) return null;
  if (s.type === "daily") return { type: "daily" };
  if (s.type === "weekly_days") {
    if (!Array.isArray(s.days)) return null;
    const days = [...new Set(s.days.filter((d): d is (typeof WEEKDAYS)[number] =>
      typeof d === "string" && (WEEKDAYS as readonly string[]).includes(d)))];
    return days.length >= 1 && days.length === s.days.length ? { type: "weekly_days", days } : null;
  }
  if (s.type === "times_per_week") {
    const t = s.times;
    return typeof t === "number" && Number.isInteger(t) && t >= 1 && t <= 7
      ? { type: "times_per_week", times: t }
      : null;
  }
  return null;
};

/** Strict parse of ONE proposal — allowlisted fields only, never a spread. */
export function parseProposal(raw: unknown): ParseResult {
  const r = rec(raw);
  if (!r) return { ok: false, error: "proposal is not an object" };

  const title = cleanTitle(r.title);
  const domain = cleanDomain(r.domain);
  if (!title) return { ok: false, error: "invalid or missing title (1–200 chars)" };
  if (!domain) return { ok: false, error: `invalid domain: ${JSON.stringify(r.domain)}` };

  switch (r.action) {
    case "create_task": {
      if (r.dueDate != null && cleanDate(r.dueDate) == null) {
        return { ok: false, error: `invalid dueDate: ${JSON.stringify(r.dueDate)}` };
      }
      const priority = r.priority ?? 2;
      if (priority !== 1 && priority !== 2 && priority !== 3) {
        return { ok: false, error: `invalid priority: ${JSON.stringify(r.priority)}` };
      }
      return {
        ok: true,
        proposal: {
          action: "create_task",
          title,
          domain,
          dueDate: r.dueDate == null ? null : cleanDate(r.dueDate),
          priority,
        },
      };
    }
    case "create_event": {
      const date = cleanDate(r.date);
      if (!date) return { ok: false, error: `invalid date: ${JSON.stringify(r.date)}` };
      if (typeof r.kind !== "string" || !isEventKind(r.kind)) {
        return { ok: false, error: `invalid kind: ${JSON.stringify(r.kind)}` };
      }
      if (r.time != null && cleanTime(r.time) == null) {
        return { ok: false, error: `invalid time (HH:MM): ${JSON.stringify(r.time)}` };
      }
      if (r.endTime != null && cleanTime(r.endTime) == null) {
        return { ok: false, error: `invalid endTime (HH:MM): ${JSON.stringify(r.endTime)}` };
      }
      return {
        ok: true,
        proposal: {
          action: "create_event",
          title,
          domain,
          kind: r.kind,
          date,
          time: r.time == null ? null : cleanTime(r.time),
          endTime: r.endTime == null ? null : cleanTime(r.endTime),
        },
      };
    }
    case "create_habit": {
      const schedule = cleanSchedule(r.schedule);
      if (!schedule) {
        return { ok: false, error: `invalid schedule: ${JSON.stringify(r.schedule)}` };
      }
      return { ok: true, proposal: { action: "create_habit", title, domain, schedule } };
    }
    default:
      return { ok: false, error: `unknown action: ${JSON.stringify(r.action)}` };
  }
}

/** Parse a `propose_changes` tool input ({proposals: [...]}) — valid items
 * survive, invalid ones become error strings (shown, never applied). */
export function parseProposalList(raw: unknown): { proposals: Proposal[]; errors: string[] } {
  const r = rec(raw);
  const list = r && Array.isArray(r.proposals) ? r.proposals : null;
  if (!list) return { proposals: [], errors: ["tool input missing a proposals array"] };
  const proposals: Proposal[] = [];
  const errors: string[] = [];
  for (const item of list.slice(0, MAX_PROPOSALS)) {
    const parsed = parseProposal(item);
    if (parsed.ok) proposals.push(parsed.proposal);
    else errors.push(parsed.error);
  }
  if (list.length > MAX_PROPOSALS) {
    errors.push(`${list.length - MAX_PROPOSALS} proposals over the limit of ${MAX_PROPOSALS} were dropped`);
  }
  return { proposals, errors };
}

const SCHEDULE_LABEL = (s: HabitSchedule): string =>
  s.type === "daily"
    ? "daily"
    : s.type === "weekly_days"
      ? s.days.join("/")
      : `${s.times}×/week`;

/** One-line human description — used on review cards and in the tool_result
 * fed back to the model after the owner decides. */
export function describeProposal(p: Proposal): string {
  switch (p.action) {
    case "create_task":
      return `Task "${p.title}" (${p.domain}, P${p.priority}${p.dueDate ? `, due ${p.dueDate}` : ""})`;
    case "create_event":
      return `Event "${p.title}" (${p.domain}, ${p.kind}, ${p.date}${p.time ? ` ${p.time}` : ""}${p.endTime ? `–${p.endTime}` : ""})`;
    case "create_habit":
      return `Habit "${p.title}" (${p.domain}, ${SCHEDULE_LABEL(p.schedule)})`;
  }
}
