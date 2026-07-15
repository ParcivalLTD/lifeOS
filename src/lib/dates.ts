/** Local-timezone date helpers. All "ISO" strings are local YYYY-MM-DD. */

const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export const toISODate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

export const todayISO = (): string => toISODate(new Date());

export const parseISODate = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const addDaysISO = (iso: string, days: number): string => {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
};

/** Whole days from `a` to `b` (positive when b is later). */
export const daysBetween = (a: string, b: string): number =>
  Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86400000);

export const weekdayOf = (iso: string): number => parseISODate(iso).getDay();

export const isValidISODate = (s: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseISODate(s).getTime());

/** "DUE TODAY" / "DUE THU" / "DUE JUL 28" / overdue → bad tone. */
export function dueLabel(
  dueISO: string,
  today: string,
): { text: string; overdue: boolean } {
  const diff = daysBetween(today, dueISO);
  const d = parseISODate(dueISO);
  if (diff < 0) return { text: `OVERDUE ${MONTHS[d.getMonth()]} ${d.getDate()}`, overdue: true };
  if (diff === 0) return { text: "DUE TODAY", overdue: false };
  if (diff < 7) return { text: `DUE ${WEEKDAYS[d.getDay()]}`, overdue: false };
  return { text: `DUE ${MONTHS[d.getMonth()]} ${d.getDate()}`, overdue: false };
}

/** Header date, e.g. "WED 15 JUL 2026". */
export function headerDate(d = new Date()): string {
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
