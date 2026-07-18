/** Pure Work-module helpers (spec §8.6). */

export const round2 = (n: number): number => Math.round(n * 100) / 100;

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

/** "JUL 9 2026" from an ISO date (no Date parsing pitfalls — split the string). */
export function achievementDate(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${d} ${y}`;
}

/**
 * FR-WORK.3 export: dated wins as clean plain text for CVs/reviews — one line
 * per win, newest first, mockup format `JUL 9 2026 — win (context)`.
 */
export function achievementsText(
  rows: { dateISO: string; title: string; context: string | null }[],
): string {
  return rows
    .map((a) => `${achievementDate(a.dateISO)} — ${a.title}${a.context ? ` (${a.context})` : ""}`)
    .join("\n");
}

/** Elapsed "H:MM" since an ISO timestamp (running-timer display). */
export function elapsedHM(startedAtISO: string, now: Date): string {
  const ms = Math.max(0, now.getTime() - new Date(startedAtISO).getTime());
  const mins = Math.floor(ms / 60_000);
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
}

/** Elapsed hours for logging a stopped timer (2dp, never below one minute). */
export function elapsedHours(startedAtISO: string, now: Date): number {
  const h = (now.getTime() - new Date(startedAtISO).getTime()) / 3_600_000;
  return Math.max(0.02, round2(h));
}
