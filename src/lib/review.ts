/**
 * Pure Review-system helpers (spec §8.10). A saved review is a POINT-IN-TIME
 * snapshot: the stats/highlights/goal states it stored are what the review
 * saw, never recomputed later — history stays honest.
 */
import { isoWeek, weekStartISO } from "@/lib/calendar";
import { addDaysISO } from "@/lib/dates";

export type ReviewType = "weekly" | "monthly" | "quarterly";

/** One computed figure with its stated basis (FR-REV.1: never fabricate). */
export type ReviewStat = { v: string; l: string; basis: string };

export type GoalSnapshot = {
  id: string;
  title: string;
  domain: string;
  horizon: string;
  pct: number;
  basis: string;
  flag: "on-track" | "at-risk" | "overdue" | "no-signal";
  flagBasis: string;
};

export type ReviewPayload = {
  rev: ReviewType;
  periodKey: string; // 2026-W28 | 2026-07 | 2026-Q3
  periodLabel: string; // W28 · JUL 6–12 | JULY 2026 | Q3 2026
  savedISO: string;
  stats?: ReviewStat[];
  highlights?: string[];
  reflections: Record<string, string>;
  goals?: GoalSnapshot[];
};

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const MONTHS_FULL = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];

const md = (iso: string): string => {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
};

// --- period keys + labels ------------------------------------------------------

export function weeklyPeriod(todayISO: string): { key: string; label: string; fromISO: string; toISO: string } {
  const from = weekStartISO(todayISO);
  const to = addDaysISO(from, 6);
  const year = Number(from.slice(0, 4));
  const week = isoWeek(todayISO);
  // same month elides the repeat: "JUL 6–12", crossing months: "JUN 29–JUL 5"
  const sameMonth = from.slice(5, 7) === to.slice(5, 7);
  const range = sameMonth ? `${md(from)}–${Number(to.slice(8, 10))}` : `${md(from)}–${md(to)}`;
  return {
    key: `${year}-W${String(week).padStart(2, "0")}`,
    label: `W${week} · ${range}`,
    fromISO: from,
    toISO: to,
  };
}

export function monthlyPeriod(todayISO: string): { key: string; label: string } {
  const [y, m] = todayISO.split("-").map(Number);
  return { key: `${y}-${String(m).padStart(2, "0")}`, label: `${MONTHS_FULL[m - 1]} ${y}` };
}

export function quarterlyPeriod(todayISO: string): { key: string; label: string } {
  const [y, m] = todayISO.split("-").map(Number);
  const q = Math.floor((m - 1) / 3) + 1;
  return { key: `${y}-Q${q}`, label: `Q${q} ${y}` };
}

// --- timeline ------------------------------------------------------------------

/** Short mono note for a timeline row, derived from the STORED snapshot. */
export function timelineNote(p: ReviewPayload, todayISO: string): string {
  if (p.savedISO === todayISO) return "COMPLETED TODAY";
  if (p.rev === "weekly") {
    const tasks = p.stats?.find((s) => s.l.toLowerCase().includes("tasks"));
    const m = tasks?.v.match(/^(\d+)\/(\d+)$/);
    if (m && Number(m[2]) > 0) {
      return `${Math.round((Number(m[1]) / Number(m[2])) * 100)}% COMPLETION`;
    }
    return "COMPLETED";
  }
  const flagged = (p.goals ?? []).filter((g) => g.flag !== "on-track").length;
  return `${(p.goals ?? []).length} GOALS · ${flagged} FLAGGED`;
}

export const REVIEW_TYPE_LABEL: Record<ReviewType, string> = {
  weekly: "WEEKLY",
  monthly: "MONTHLY",
  quarterly: "QUARTERLY",
};
