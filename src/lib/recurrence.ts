/**
 * Minimal RFC 5545 RRULE subset for task recurrence (spec §7.2).
 * Supported: FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL=n, BYDAY=MO,WE,FR
 * (BYDAY only meaningful with FREQ=WEEKLY).
 */
import { addDaysISO, parseISODate, toISODate, weekdayOf } from "./dates";

const BYDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

export type Recurrence = {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  /** JS weekday indices, 0 = Sunday. */
  byday?: number[];
};

export function parseRRule(rule: string | null | undefined): Recurrence | null {
  if (!rule) return null;
  const parts = new Map<string, string>();
  for (const seg of rule.trim().toUpperCase().split(";")) {
    const [k, v] = seg.split("=");
    if (k && v) parts.set(k.trim(), v.trim());
  }
  const freq = parts.get("FREQ");
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") {
    return null;
  }
  const interval = Math.max(1, Number(parts.get("INTERVAL") ?? 1) || 1);
  const byday = parts
    .get("BYDAY")
    ?.split(",")
    .map((code) => BYDAY_CODES.indexOf(code as (typeof BYDAY_CODES)[number]))
    .filter((i) => i >= 0);
  return { freq, interval, byday: byday?.length ? byday : undefined };
}

/** Next occurrence strictly after `fromISO`, or null for unparseable rules. */
export function nextDueISO(rule: string, fromISO: string): string | null {
  const r = parseRRule(rule);
  if (!r) return null;

  switch (r.freq) {
    case "DAILY":
      return addDaysISO(fromISO, r.interval);
    case "WEEKLY": {
      if (r.byday?.length) {
        for (let i = 1; i <= 7; i++) {
          const candidate = addDaysISO(fromISO, i);
          if (r.byday.includes(weekdayOf(candidate))) return candidate;
        }
        return null; // unreachable — 7 days always cover byday
      }
      return addDaysISO(fromISO, 7 * r.interval);
    }
    case "MONTHLY": {
      const d = parseISODate(fromISO);
      const targetDay = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + r.interval);
      const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(targetDay, daysInMonth));
      return toISODate(d);
    }
    case "YEARLY": {
      const d = parseISODate(fromISO);
      const targetDay = d.getDate();
      d.setDate(1);
      d.setFullYear(d.getFullYear() + r.interval);
      const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(targetDay, daysInMonth));
      return toISODate(d);
    }
  }
}

/** Compact mono label, e.g. "DAILY", "MON/WED/FRI", "EVERY 2 WEEKS". */
export function recurrenceLabel(rule: string | null | undefined): string | null {
  const r = parseRRule(rule);
  if (!r) return null;
  const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  if (r.freq === "WEEKLY" && r.byday?.length) {
    return r.byday
      .slice()
      .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)) // Monday-first
      .map((i) => DOW[i])
      .join("/");
  }
  const unit = { DAILY: "DAY", WEEKLY: "WEEK", MONTHLY: "MONTH", YEARLY: "YEAR" }[r.freq];
  return r.interval === 1 ? `${r.freq}` : `EVERY ${r.interval} ${unit}S`;
}
