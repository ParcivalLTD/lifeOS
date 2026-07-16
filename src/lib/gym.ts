/**
 * Gym computations (FR-GYM.*): estimated 1RM, PRs, session progress, weekly
 * adherence. Pure and client-safe — no I/O. The Gym module is a thin view
 * over the core: templates and sessions are Events (kind=session), lift 1RMs
 * are Metrics (§5.1 hub-and-spoke).
 */
import type { GymSetLog } from "@/db/schema";

export type TemplateExercise = {
  name: string;
  targetSets: number;
  targetReps: number;
  targetKg?: number;
};

export type SessionExercise = TemplateExercise & { sets: GymSetLog[] };

/** " e1RM" suffix marks the metrics this module owns, per lift. */
export const E1RM_SUFFIX = " e1RM";
export const liftMetricName = (lift: string): string => `${lift}${E1RM_SUFFIX}`;
export const liftFromMetricName = (name: string): string =>
  name.endsWith(E1RM_SUFFIX) ? name.slice(0, -E1RM_SUFFIX.length) : name;
export const isLiftMetric = (name: string): boolean => name.endsWith(E1RM_SUFFIX);

export const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Estimated 1-rep max (Epley): weight × (1 + reps/30); a single rep is the
 * weight itself. Returns 0 for non-positive input.
 */
export function epley1RM(kg: number, reps: number): number {
  if (kg <= 0 || reps <= 0) return 0;
  if (reps === 1) return kg;
  return kg * (1 + reps / 30);
}

/** Best estimated 1RM across a lift's *done* sets, or null if none logged. */
export function bestE1RM(sets: GymSetLog[]): number | null {
  let best = 0;
  for (const s of sets) {
    if (!s.done) continue;
    const e = epley1RM(s.kg, s.reps);
    if (e > best) best = e;
  }
  return best > 0 ? round1(best) : null;
}

/** Done/total set counts across all exercises in a session. */
export function sessionSetCounts(exercises: SessionExercise[]): {
  done: number;
  total: number;
} {
  let done = 0;
  let total = 0;
  for (const ex of exercises) {
    for (const s of ex.sets) {
      total += 1;
      if (s.done) done += 1;
    }
  }
  return { done, total };
}

/** A session counts as completed once at least one set is logged. */
export const isSessionLogged = (exercises: SessionExercise[]): boolean =>
  exercises.some((ex) => ex.sets.some((s) => s.done));

/** "4 × 6 @ 82.5 KG" (drops the weight when a target isn't set). */
export function targetLabel(ex: TemplateExercise): string {
  const base = `${ex.targetSets} × ${ex.targetReps}`;
  return ex.targetKg != null ? `${base} @ ${round1(ex.targetKg)} KG` : base;
}

/** "82.5 × 6" set value for the log row. */
export const setValueLabel = (s: GymSetLog): string => `${round1(s.kg)} × ${s.reps}`;

/** "80 KG — 6,6,6,5" summary of a previous session's sets for pre-fill hints. */
export function lastSetsSummary(sets: GymSetLog[]): string | null {
  const done = sets.filter((s) => s.done);
  if (done.length === 0) return null;
  const kg = round1(done[0].kg);
  const sameKg = done.every((s) => round1(s.kg) === kg);
  const reps = done.map((s) => s.reps).join(",");
  return sameKg ? `${kg} KG — ${reps}` : done.map((s) => `${round1(s.kg)}×${s.reps}`).join(", ");
}

// --- Adherence (FR-GYM.4) ----------------------------------------------------

export type WeekBucket = { planned: number; completed: number };

export const adherencePct = ({ planned, completed }: WeekBucket): number =>
  planned === 0 ? 0 : Math.round((completed / planned) * 100);

/** Aggregate adherence across buckets (e.g. last 8 weeks). */
export function aggregateAdherence(buckets: WeekBucket[]): {
  completed: number;
  planned: number;
  pct: number;
} {
  const completed = buckets.reduce((n, b) => n + b.completed, 0);
  const planned = buckets.reduce((n, b) => n + b.planned, 0);
  return { completed, planned, pct: adherencePct({ planned, completed }) };
}
