/** Calendar grid math + labels (FR-CAL.1). Pure date-string functions. */
import { addDaysISO, parseISODate, toISODate, weekdayOf } from "./dates";

const MONTHS_FULL = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];
const DOW_MON_FIRST = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export type CalendarView = "month" | "week" | "day";

export const isCalendarView = (v: string): v is CalendarView =>
  v === "month" || v === "week" || v === "day";

/** Monday of the week containing `iso`. */
export const weekStartISO = (iso: string): string =>
  addDaysISO(iso, -((weekdayOf(iso) + 6) % 7));

/** The 7 dates (Mon–Sun) of the week containing `iso`. */
export const weekDates = (iso: string): string[] => {
  const start = weekStartISO(iso);
  return Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
};

/** Monday-first weekday header labels. */
export const dowLabels = (): string[] => DOW_MON_FIRST.slice();

export const dowLabelOf = (iso: string): string =>
  DOW_MON_FIRST[(weekdayOf(iso) + 6) % 7];

/**
 * Full-week grid covering the month of `iso`: Monday before (or on) the 1st
 * through Sunday after (or on) the last day. 35 or 42 cells.
 */
export function monthGridDates(iso: string): { dateISO: string; inMonth: boolean }[] {
  const d = parseISODate(iso);
  const first = toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
  const last = toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  const gridStart = weekStartISO(first);
  const gridEnd = addDaysISO(weekStartISO(last), 6);
  const cells: { dateISO: string; inMonth: boolean }[] = [];
  for (let day = gridStart; day <= gridEnd; day = addDaysISO(day, 1)) {
    cells.push({ dateISO: day, inMonth: day >= first && day <= last });
  }
  return cells;
}

/** ISO-8601 week number (weeks start Monday, week 1 contains Jan 4). */
export function isoWeek(iso: string): number {
  const d = parseISODate(iso);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  target.setDate(target.getDate() - ((target.getDay() + 6) % 7) + 3); // Thu of this week
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  firstThursday.setDate(
    firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3,
  );
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

/** Toolbar label: "JULY 2026" / "JULY 2026 · WEEK 29" / "WED 15 JUL 2026". */
export function rangeLabel(view: CalendarView, iso: string): string {
  const d = parseISODate(iso);
  const monthYear = `${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
  if (view === "month") return monthYear;
  if (view === "week") return `${monthYear} · WEEK ${isoWeek(iso)}`;
  const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return `${dowLabelOf(iso)} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Anchor date for the prev/next toolbar arrows. */
export function stepDate(view: CalendarView, iso: string, dir: 1 | -1): string {
  if (view === "day") return addDaysISO(iso, dir);
  if (view === "week") return addDaysISO(iso, 7 * dir);
  const d = parseISODate(iso);
  const target = new Date(d.getFullYear(), d.getMonth() + dir, 1);
  return toISODate(target);
}

/** [start, end) date range a view must load. */
export function viewRange(view: CalendarView, iso: string): { from: string; to: string } {
  if (view === "day") return { from: iso, to: addDaysISO(iso, 1) };
  if (view === "week") {
    const start = weekStartISO(iso);
    return { from: start, to: addDaysISO(start, 7) };
  }
  const cells = monthGridDates(iso);
  return { from: cells[0].dateISO, to: addDaysISO(cells[cells.length - 1].dateISO, 1) };
}
