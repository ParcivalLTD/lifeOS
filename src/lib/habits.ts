/**
 * Habit schedule semantics, streaks, and adherence (FR-PERS.2).
 * Pure functions over completion-date sets — no I/O.
 */
import type { HabitSchedule } from "@/db/schema";
import { addDaysISO, weekdayOf } from "./dates";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export const dayKeyOf = (iso: string): DayKey => DAY_KEYS[weekdayOf(iso)];

/** Whether the habit is expected on this date. n-per-week habits are flexible. */
export function isScheduledOn(schedule: HabitSchedule, iso: string): boolean {
  switch (schedule.type) {
    case "daily":
      return true;
    case "weekly_days":
      return schedule.days.includes(dayKeyOf(iso));
    case "times_per_week":
      return true;
  }
}

/** Compact label: "DAILY" | "MON/WED/THU" | "3×/WEEK". */
export function scheduleLabel(schedule: HabitSchedule): string {
  switch (schedule.type) {
    case "daily":
      return "DAILY";
    case "weekly_days": {
      const order: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
      return order
        .filter((d) => schedule.days.includes(d))
        .map((d) => d.toUpperCase())
        .join("/");
    }
    case "times_per_week":
      return `${schedule.times}×/WEEK`;
  }
}

const MAX_WALK_DAYS = 500;

/** Monday-based start of the week containing `iso`. */
const weekStart = (iso: string): string =>
  addDaysISO(iso, -((weekdayOf(iso) + 6) % 7));

/**
 * Current streak, ending today.
 * - daily / weekly_days: consecutive scheduled days done. A scheduled-but-
 *   unticked *today* is pending, not a break.
 * - times_per_week: consecutive weeks meeting the quota. The current week
 *   counts once met, and is pending (not a break) until the week ends.
 */
export function streak(
  schedule: HabitSchedule,
  doneDates: ReadonlySet<string>,
  today: string,
): number {
  // schedule.since bounds the walk: history before a schedule edit belongs to
  // the old schedule and is neither credited nor penalised under the new one.
  const since = schedule.since;

  if (schedule.type === "times_per_week") {
    let count = 0;
    let start = weekStart(today);
    // current week: count if already met, otherwise it's pending — skip it.
    // A week straddling `since` is partial under this schedule: skip it too.
    if (!since || start >= since) {
      let doneThisWeek = 0;
      for (let d = start, i = 0; i < 7; i++, d = addDaysISO(d, 1)) {
        if (doneDates.has(d)) doneThisWeek++;
      }
      if (doneThisWeek >= schedule.times) count++;
    }
    // walk completed weeks backwards
    for (let w = 1; w < MAX_WALK_DAYS / 7; w++) {
      start = addDaysISO(start, -7);
      if (since && start < since) break;
      let done = 0;
      for (let d = start, i = 0; i < 7; i++, d = addDaysISO(d, 1)) {
        if (doneDates.has(d)) done++;
      }
      if (done >= schedule.times) count++;
      else break;
    }
    return count;
  }

  let count = 0;
  let day = today;
  // pending today: scheduled but not yet ticked doesn't break the streak
  if (isScheduledOn(schedule, day) && !doneDates.has(day)) {
    day = addDaysISO(day, -1);
  }
  for (let i = 0; i < MAX_WALK_DAYS; i++, day = addDaysISO(day, -1)) {
    if (since && day < since) break;
    if (!isScheduledOn(schedule, day)) continue;
    if (doneDates.has(day)) count++;
    else break;
  }
  return count;
}

/**
 * Adherence over the trailing 7-day window (today-6 … today) as
 * done-credits / expected-slots. Used per habit and aggregated for the panel.
 */
export function adherenceWindow(
  schedule: HabitSchedule,
  doneDates: ReadonlySet<string>,
  today: string,
): { done: number; expected: number } {
  const windowDays: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDaysISO(today, -i);
    // days before a schedule edit are judged by the old schedule, not this one
    if (schedule.since && d < schedule.since) continue;
    windowDays.push(d);
  }

  if (schedule.type === "times_per_week") {
    // prorate the weekly quota when the window is clipped by `since`
    const expected = Math.min(schedule.times, windowDays.length);
    const done = windowDays.filter((d) => doneDates.has(d)).length;
    return { done: Math.min(done, expected), expected };
  }

  const scheduled = windowDays.filter((d) => isScheduledOn(schedule, d));
  const done = scheduled.filter((d) => doneDates.has(d)).length;
  return { done, expected: scheduled.length };
}

export const pct = (done: number, expected: number): number =>
  expected === 0 ? 100 : Math.round((done / expected) * 100);
