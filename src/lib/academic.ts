/**
 * Pure academic helpers (FR-ACAD.2–4). The pace indicator is a COMPUTED
 * signal in the FR-GOAL.3 sense: every flag carries an explicit `basis`
 * string saying exactly what it was derived from, and missing inputs produce
 * "no data" flags — never a fabricated number.
 */

export const round1 = (n: number): number => Math.round(n * 10) / 10;

export type PaceAssessment = {
  name: string;
  weight: number | null; // % of final mark; null = unweighted (forms, hurdles)
  grade: number | null; // % achieved; null = not yet graded
  dueISO: string;
};

export type PaceFlag = "on-track" | "tight" | "at-risk" | "no-target" | "no-data";
export type PaceTone = "good" | "warn" | "bad" | "faint";

export type Pace = {
  flag: PaceFlag;
  label: string; // chip text, e.g. "AT RISK"
  tone: PaceTone;
  basis: string; // what the flag means, stated in the UI
};

/** Required average (%) on remaining weight to still reach `target`. */
const TIGHT_ABOVE = 85;

/**
 * Weighted current grade over GRADED work only: Σ(w·g)/Σw. Null when nothing
 * weighted has a grade yet — callers must show "no data", not 0.
 */
export function currentGrade(assessments: PaceAssessment[]): number | null {
  let earned = 0;
  let gradedW = 0;
  for (const a of assessments) {
    if (a.weight != null && a.grade != null) {
      earned += (a.weight * a.grade) / 100;
      gradedW += a.weight;
    }
  }
  return gradedW > 0 ? round1((earned / gradedW) * 100) : null;
}

/**
 * Pace flag for one course. Meaning (also surfaced via `basis`):
 * - AT RISK  — an ungraded assessment is due/overdue, or the target grade is
 *              mathematically unreachable even with 100% on remaining weight.
 * - TIGHT    — reachable, but needs > 85% average on the remaining weight.
 * - ON TRACK — reachable with ≤ 85% average on the remaining weight.
 * - NO TARGET / NO DATA — required inputs missing; says which.
 * All arithmetic is over LISTED weights; if they don't cover 100% the basis
 * says so rather than assuming the rest.
 */
export function computePace(
  targetGrade: number | null,
  assessments: PaceAssessment[],
  todayISO: string,
): Pace {
  const dueNow = assessments.filter((a) => a.grade == null && a.dueISO <= todayISO);
  if (dueNow.length > 0) {
    const a = dueNow[0];
    const when = a.dueISO < todayISO ? "OVERDUE" : "DUE TODAY";
    return {
      flag: "at-risk",
      label: "AT RISK",
      tone: "bad",
      basis: `${when}: ${a.name.toUpperCase()} — UNGRADED PAST ITS DUE DATE`,
    };
  }

  if (targetGrade == null) {
    return {
      flag: "no-target",
      label: "NO TARGET",
      tone: "faint",
      basis: "SET A TARGET GRADE TO ENABLE PACE",
    };
  }

  let earned = 0; // points of final mark already banked
  let gradedW = 0;
  let remainingW = 0;
  for (const a of assessments) {
    if (a.weight == null) continue;
    if (a.grade != null) {
      earned += (a.weight * a.grade) / 100;
      gradedW += a.weight;
    } else {
      remainingW += a.weight;
    }
  }
  const totalW = gradedW + remainingW;
  if (totalW === 0) {
    return {
      flag: "no-data",
      label: "NO DATA",
      tone: "faint",
      basis: "NO WEIGHTED ASSESSMENTS YET — ADD WEIGHTS TO ENABLE PACE",
    };
  }

  const coverage = totalW < 100 ? ` (WEIGHTS COVER ${round1(totalW)}% OF FINAL)` : "";

  if (remainingW === 0) {
    const final = round1((earned / gradedW) * 100);
    return final >= targetGrade
      ? { flag: "on-track", label: "ON TRACK", tone: "good", basis: `ALL GRADED: ${final}% ≥ TARGET ${targetGrade}%${coverage}` }
      : { flag: "at-risk", label: "AT RISK", tone: "bad", basis: `ALL GRADED: ${final}% < TARGET ${targetGrade}%${coverage}` };
  }

  // average needed on the remaining weight to end at target (listed weights)
  const needed = round1(((targetGrade / 100) * totalW - earned) / remainingW * 100);

  if (needed > 100) {
    return {
      flag: "at-risk",
      label: "AT RISK",
      tone: "bad",
      basis: `TARGET ${targetGrade}% UNREACHABLE — NEEDS ${needed}% AVG ON REMAINING ${round1(remainingW)}%${coverage}`,
    };
  }
  if (needed > TIGHT_ABOVE) {
    return {
      flag: "tight",
      label: "TIGHT",
      tone: "warn",
      basis: `NEEDS ${needed}% AVG ON REMAINING ${round1(remainingW)}%${coverage}`,
    };
  }
  return {
    flag: "on-track",
    label: "ON TRACK",
    tone: "good",
    basis: `NEEDS ${Math.max(0, needed)}% AVG ON REMAINING ${round1(remainingW)}%${coverage}`,
  };
}

/** Mean of values, 1dp; null for an empty list (never fabricate an average). */
export function mean1(values: number[]): number | null {
  if (values.length === 0) return null;
  return round1(values.reduce((s, v) => s + v, 0) / values.length);
}
