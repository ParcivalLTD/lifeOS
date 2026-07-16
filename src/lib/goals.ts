/**
 * Goal-engine computations (FR-GOAL.*): horizons and progress rollup. Pure and
 * client-safe. A goal's progress is computed honestly from real signals —
 * milestone (child-goal) rollup, linked-Habit adherence, linked-Metric value
 * vs a parsed target, and funding savings — never fabricated (§5.1).
 */
export type Horizon = "life" | "yearly" | "quarterly" | "monthly";
export const HORIZONS: Horizon[] = ["life", "yearly", "quarterly", "monthly"];
export const HORIZON_LABEL: Record<Horizon, string> = {
  life: "LIFE",
  yearly: "YEARLY",
  quarterly: "QUARTERLY",
  monthly: "MONTHLY",
};

export type GoalStatus = "active" | "achieved" | "abandoned" | "paused";
export type MetricDirection = "higher-better" | "lower-better" | "target-range";

/** What a goal's computed progress is based on (shown for honesty). */
export type ProgressBasis = "achieved" | "milestones" | "habits" | "metric" | "savings" | "none";

export const clampPct = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));
export const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Largest positive number in a string (targets live in title/success text). */
export function parseTarget(text: string): number | null {
  const matches = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  const nums = matches.map((s) => Number(s.replace(/,/g, ""))).filter((n) => Number.isFinite(n) && n > 0);
  return nums.length ? Math.max(...nums) : null;
}

/** Progress of a metric toward a target, respecting direction. */
export function metricProgressPct(current: number, target: number, direction: MetricDirection): number {
  if (target <= 0) return 0;
  if (direction === "lower-better") {
    // "keep it under target" — at/under target reads as on-track
    return current <= 0 ? 100 : clampPct((target / current) * 100);
  }
  return clampPct((current / target) * 100);
}
