/**
 * Sleep analysis (FR-HLTH, stage 4). PURE — no I/O — so every figure is
 * unit-testable.
 *
 * Honesty rule (same as goal progress and reviews): every number carries a
 * `basis` string stating exactly what it was computed from; anything the
 * data cannot support is null with a basis SAYING WHY — never a guess, and
 * never a manufactured single "sleep score".
 */

export type SleepNightData = {
  /** the wake-up day (nights are keyed by the morning they end on) */
  dateISO: string;
  /** hours asleep, or null when the night only has stage rows */
  hours: number | null;
  deepMin: number | null;
  remMin: number | null;
  lightMin: number | null;
  awakeMin: number | null;
  /** REAL wake-up instant (ISO datetime) — only synced nights have one;
   * manual logs are date-only and are excluded from time-of-day stats. */
  wakeAt: string | null;
};

/** One day's adherence outcomes, for the pattern check. */
export type DayOutcome = {
  dateISO: string;
  habitsScheduled: number;
  habitsDone: number;
  /** null = no gym session planned that day */
  gymDone: boolean | null;
};

export type BasedNumber = { value: number | null; basis: string };

const round1 = (n: number) => Math.round(n * 10) / 10;

// --- duration trend ------------------------------------------------------------

export type DurationTrend = { avg7: BasedNumber; avg30: BasedNumber };

function avgOver(nights: SleepNightData[], fromISO: string, label: string): BasedNumber {
  const win = nights.filter((n) => n.dateISO >= fromISO && n.hours !== null);
  if (win.length === 0) {
    return { value: null, basis: `no nights with a duration in the last ${label}` };
  }
  const mean = win.reduce((s, n) => s + (n.hours ?? 0), 0) / win.length;
  return {
    value: round1(mean),
    basis: `mean of ${win.length} night${win.length === 1 ? "" : "s"} with data in the last ${label}`,
  };
}

/** `todayISO` anchors the trailing windows; nights are the last ~30 days. */
export function durationTrend(nights: SleepNightData[], todayISO: string, addDays: (iso: string, d: number) => string): DurationTrend {
  return {
    avg7: avgOver(nights, addDays(todayISO, -6), "7 days"),
    avg30: avgOver(nights, addDays(todayISO, -29), "30 days"),
  };
}

// --- consistency (variance of bed/wake clock times) ------------------------------

export type Consistency = {
  /** ± minutes (circular std dev) — null when too few timed nights */
  wakeSdMin: number | null;
  bedSdMin: number | null;
  nights: number;
  basis: string;
};

const MIN_TIMED_NIGHTS = 5;

/** Circular standard deviation of clock times (minutes past midnight), so a
 * 23:30/00:30 bedtime split doesn't read as a 23-hour spread. Returns
 * minutes. */
export function circularSdMinutes(minutes: number[]): number {
  const n = minutes.length;
  let sinSum = 0;
  let cosSum = 0;
  for (const m of minutes) {
    const a = (m / 1440) * 2 * Math.PI;
    sinSum += Math.sin(a);
    cosSum += Math.cos(a);
  }
  const r = Math.sqrt(sinSum ** 2 + cosSum ** 2) / n;
  if (r >= 1) return 0;
  const sdRad = Math.sqrt(-2 * Math.log(r));
  return (sdRad / (2 * Math.PI)) * 1440;
}

/**
 * Wake times are the synced nights' real timestamps; bed time is derived as
 * wake − time in bed (asleep + awake minutes when stages exist, asleep only
 * otherwise) — stated in the basis. Manual date-only logs are excluded.
 */
export function consistency(nights: SleepNightData[]): Consistency {
  const timed = nights.filter((n) => n.wakeAt !== null && n.hours !== null);
  if (timed.length < MIN_TIMED_NIGHTS) {
    return {
      wakeSdMin: null,
      bedSdMin: null,
      nights: timed.length,
      basis: `needs ≥${MIN_TIMED_NIGHTS} synced nights with real wake times (${timed.length} available — manual logs carry no clock time)`,
    };
  }
  const wakeMin: number[] = [];
  const bedMin: number[] = [];
  for (const n of timed) {
    const wake = new Date(n.wakeAt!);
    const w = wake.getHours() * 60 + wake.getMinutes();
    wakeMin.push(w);
    const inBedMin = (n.hours ?? 0) * 60 + (n.awakeMin ?? 0);
    bedMin.push((((w - inBedMin) % 1440) + 1440) % 1440);
  }
  return {
    wakeSdMin: Math.round(circularSdMinutes(wakeMin)),
    bedSdMin: Math.round(circularSdMinutes(bedMin)),
    nights: timed.length,
    basis: `circular std-dev over ${timed.length} synced nights; bed time derived as wake − (asleep + awake) minutes`,
  };
}

// --- stage proportions vs reference ranges ---------------------------------------

/** General adult reference ranges for stage share of total sleep — the
 * commonly cited guidance (deep ~13–23%, REM ~20–25%, light ~40–60%).
 * Presented as "your average vs range", deliberately NOT collapsed into a
 * score. */
export const STAGE_RANGES = {
  deep: { lo: 13, hi: 23, label: "Deep" },
  rem: { lo: 20, hi: 25, label: "REM" },
  light: { lo: 40, hi: 60, label: "Light" },
} as const;

export type StageKey = keyof typeof STAGE_RANGES;

export type StageBalance = {
  stages: {
    key: StageKey;
    label: string;
    avgPct: number;
    lo: number;
    hi: number;
    within: boolean;
  }[] | null;
  nights: number;
  basis: string;
};

const MIN_STAGED_NIGHTS = 3;

export function stageBalance(nights: SleepNightData[]): StageBalance {
  const staged = nights.filter(
    (n) => n.deepMin !== null && n.remMin !== null && n.lightMin !== null,
  );
  if (staged.length < MIN_STAGED_NIGHTS) {
    return {
      stages: null,
      nights: staged.length,
      basis: `needs ≥${MIN_STAGED_NIGHTS} nights with a stage breakdown (${staged.length} available)`,
    };
  }
  let deep = 0;
  let rem = 0;
  let light = 0;
  for (const n of staged) {
    deep += n.deepMin ?? 0;
    rem += n.remMin ?? 0;
    light += n.lightMin ?? 0;
  }
  const total = deep + rem + light;
  if (total <= 0) {
    return { stages: null, nights: staged.length, basis: "stage minutes sum to zero" };
  }
  const pct = (m: number) => Math.round((m / total) * 100);
  const mk = (key: StageKey, m: number) => {
    const r = STAGE_RANGES[key];
    const avgPct = pct(m);
    return { key, label: r.label, avgPct, lo: r.lo, hi: r.hi, within: avgPct >= r.lo && avgPct <= r.hi };
  };
  return {
    stages: [mk("deep", deep), mk("rem", rem), mk("light", light)],
    nights: staged.length,
    basis: `share of asleep stage minutes over ${staged.length} nights vs general adult reference ranges — an average, not a score`,
  };
}

// --- pattern flags (short sleep ↔ adherence) ---------------------------------------

export type SleepFlag = { text: string; basis: string };

export type PatternResult = {
  flags: SleepFlag[];
  /** why nothing was flagged, when nothing was — never silent */
  note: string | null;
};

/** A "short" night: under 6.5 h asleep (stated in every basis). */
export const SHORT_NIGHT_HOURS = 6.5;
const MIN_GROUP_DAYS = 4;
const MIN_DIFF_PP = 20;

/**
 * Compares SAME-DAY outcomes after short vs non-short nights, using the
 * modules' own adherence data (habit completions, gym sessions). A flag needs
 * ≥4 qualifying days on each side AND a ≥20-percentage-point gap — anything
 * weaker is reported as "no supported pattern", with the reason.
 */
export function patternFlags(
  nights: SleepNightData[],
  outcomes: DayOutcome[],
): PatternResult {
  const byDay = new Map(outcomes.map((o) => [o.dateISO, o]));
  const withHours = nights.filter((n) => n.hours !== null);
  const short = withHours.filter((n) => (n.hours ?? 0) < SHORT_NIGHT_HOURS);
  const ok = withHours.filter((n) => (n.hours ?? 0) >= SHORT_NIGHT_HOURS);

  if (withHours.length < MIN_GROUP_DAYS * 2) {
    return {
      flags: [],
      note: `not enough sleep data to test patterns (${withHours.length} nights; needs ≥${MIN_GROUP_DAYS * 2})`,
    };
  }
  if (short.length < MIN_GROUP_DAYS || ok.length < MIN_GROUP_DAYS) {
    return {
      flags: [],
      note: `not enough contrast to test patterns (${short.length} short vs ${ok.length} adequate nights at the <${SHORT_NIGHT_HOURS}h threshold; needs ≥${MIN_GROUP_DAYS} each)`,
    };
  }

  const flags: SleepFlag[] = [];
  const reasons: string[] = [];

  // habits: completion rate on days with something scheduled
  const habitRate = (group: SleepNightData[]) => {
    let done = 0;
    let scheduled = 0;
    let days = 0;
    for (const n of group) {
      const o = byDay.get(n.dateISO);
      if (!o || o.habitsScheduled === 0) continue;
      done += o.habitsDone;
      scheduled += o.habitsScheduled;
      days++;
    }
    return scheduled > 0 ? { pct: Math.round((done / scheduled) * 100), days } : null;
  };
  const hShort = habitRate(short);
  const hOk = habitRate(ok);
  if (hShort && hOk && hShort.days >= MIN_GROUP_DAYS && hOk.days >= MIN_GROUP_DAYS) {
    const diff = hOk.pct - hShort.pct;
    if (diff >= MIN_DIFF_PP) {
      flags.push({
        text: `Habit completion drops after short sleep: ${hShort.pct}% vs ${hOk.pct}%`,
        basis: `days after <${SHORT_NIGHT_HOURS}h nights (${hShort.days}d) vs after adequate nights (${hOk.days}d), scheduled habits only`,
      });
    } else {
      reasons.push(`habit gap ${diff}pp (below the ${MIN_DIFF_PP}pp bar)`);
    }
  } else {
    reasons.push("too few days with scheduled habits on one side");
  }

  // gym: completion among days with a planned session
  const gymRate = (group: SleepNightData[]) => {
    let done = 0;
    let planned = 0;
    for (const n of group) {
      const o = byDay.get(n.dateISO);
      if (!o || o.gymDone === null) continue;
      planned++;
      if (o.gymDone) done++;
    }
    return planned > 0 ? { pct: Math.round((done / planned) * 100), days: planned } : null;
  };
  const gShort = gymRate(short);
  const gOk = gymRate(ok);
  if (gShort && gOk && gShort.days >= MIN_GROUP_DAYS && gOk.days >= MIN_GROUP_DAYS) {
    const diff = gOk.pct - gShort.pct;
    if (diff >= MIN_DIFF_PP) {
      flags.push({
        text: `Workouts get skipped after short sleep: ${gShort.pct}% vs ${gOk.pct}% completed`,
        basis: `planned gym days after <${SHORT_NIGHT_HOURS}h nights (${gShort.days}d) vs after adequate nights (${gOk.days}d)`,
      });
    } else {
      reasons.push(`gym gap ${diff}pp (below the ${MIN_DIFF_PP}pp bar)`);
    }
  } else {
    reasons.push("too few planned gym days on one side");
  }

  return {
    flags,
    note: flags.length > 0 ? null : `no supported pattern: ${reasons.join("; ")}`,
  };
}

// --- assembled result ---------------------------------------------------------------

export type SleepAnalysis = {
  trend: DurationTrend;
  consistency: Consistency;
  stages: StageBalance;
  patterns: PatternResult;
  /** nights that fed the analysis (30-day window) */
  nightCount: number;
};

export function analyzeSleep(
  nights: SleepNightData[],
  outcomes: DayOutcome[],
  todayISO: string,
  addDays: (iso: string, d: number) => string,
): SleepAnalysis {
  return {
    trend: durationTrend(nights, todayISO, addDays),
    consistency: consistency(nights),
    stages: stageBalance(nights),
    patterns: patternFlags(nights, outcomes),
    nightCount: nights.length,
  };
}
