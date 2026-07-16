/**
 * Finance computations (FR-FIN.*): money formatting, budget thresholds, month
 * helpers. Pure and client-safe. The Finance module is a thin view over the
 * core (§5.1): accounts/budgets/expenses/savings/bills are Events with a
 * `fin` payload discriminator; net worth and spend trends are Metrics.
 */
import { parseISODate, toISODate } from "./dates";

export const DEFAULT_CURRENCY = "A$";

/** "A$1,234" (or with cents). Compact, tabular — matches the mockup. */
export function fmtMoney(
  amount: number,
  { cents = false, currency = DEFAULT_CURRENCY, sign = false }: { cents?: boolean; currency?: string; sign?: boolean } = {},
): string {
  const abs = Math.abs(amount);
  const body = abs.toLocaleString("en-AU", {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
  const prefix = amount < 0 ? "-" : sign ? "+" : "";
  return `${prefix}${currency}${body}`;
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;
export const clampPct = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

// --- budgets (FR-FIN.2) ------------------------------------------------------

export type BudgetStatus = "good" | "warn" | "over";

/** Design thresholds: green → amber above ~88% → red above 100%. */
export function budgetStatus(spent: number, cap: number): BudgetStatus {
  if (cap <= 0) return spent > 0 ? "over" : "good";
  const p = spent / cap;
  if (p > 1) return "over";
  if (p > 0.88) return "warn";
  return "good";
}

export const BUDGET_STATUS_COLOR: Record<BudgetStatus, string> = {
  good: "oklch(0.55 0.10 150)",
  warn: "oklch(0.62 0.13 55)",
  over: "oklch(0.55 0.13 20)",
};

export const budgetFillPct = (spent: number, cap: number): number =>
  cap <= 0 ? (spent > 0 ? 100 : 0) : clampPct((spent / cap) * 100);

// --- months ------------------------------------------------------------------

/** "2026-07" for the month containing an ISO date. */
export const monthKey = (iso: string): string => iso.slice(0, 7);
export const currentMonthKey = (): string => monthKey(toISODate(new Date()));

/** Inclusive-exclusive ISO bounds [start, nextMonthStart) for a "YYYY-MM". */
export function monthBounds(key: string): { from: string; to: string } {
  const [y, m] = key.split("-").map(Number);
  const from = `${key}-01`;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const to = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
  return { from, to };
}

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
export const monthLabel = (key: string): string => MONTHS[Number(key.split("-")[1]) - 1];
export const monthLabelOf = (iso: string): string => MONTHS[parseISODate(iso).getMonth()];
