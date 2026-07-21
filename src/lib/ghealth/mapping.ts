/**
 * Google Health → Helm core mapping. PURE — no I/O, no DB — so every mapper
 * is unit-testable and the sync module stays a thin orchestrator.
 *
 * Hub-and-spoke discipline (spec §5.1): synced health data lands in the SAME
 * two core shapes everything else uses — Metric datapoints for measurements,
 * Events for exercise sessions. No private tables.
 *
 * Field names come from the current API reference (users.dataTypes.dataPoints,
 * fetched 2026-07-21): weightGrams, beatsPerMinute,
 * averageHeartRateVariabilityMilliseconds, summary.stagesSummary, energy/
 * totalCarbohydrate/totalFat/nutrients on nutritionLog, exerciseType, etc.
 */
import type { Domain } from "@/lib/domains";

// --- exercise-type policy ------------------------------------------------

/**
 * Exercise types that stay OUT of Helm even though Google reports them:
 * anything gym-shaped. Gym sessions are first-class, manually-logged Events
 * with set/rep payloads and e1RM metrics — a watch-detected "strength
 * training" blob colliding with them would double-count workouts and pollute
 * adherence. Deliberately a flat config list (per the brief) so it can be
 * tuned when the taxonomy surprises us, not buried in logic.
 *
 * Values from the API's exercise-type enum (docs, 2026-07-21).
 */
export const EXCLUDED_EXERCISE_TYPES: readonly string[] = [
  "STRENGTH_TRAINING",
  "WEIGHT_MACHINES",
  "WEIGHTS",
  "FREE_WEIGHTS",
  "FUNCTIONAL_STRENGTH_TRAINING",
  "POWERLIFTING",
  "BODY_WEIGHT",
  "RESISTANCE_BANDS",
  "CORE_TRAINING",
  "CIRCUIT_TRAINING",
  "CROSSFIT",
  "TRX",
  "BOOTCAMP",
];

export const isExcludedExerciseType = (t: string): boolean =>
  EXCLUDED_EXERCISE_TYPES.includes(t.toUpperCase());

// --- metric catalogue ------------------------------------------------------

export type MetricSpec = {
  name: string;
  unit: string;
  direction: "higher-better" | "lower-better" | "target-range";
  domain: Domain;
};

/** Every Metric the sync writes into. `Body weight` and `Sleep hours` already
 * exist in the schema/seed and are REUSED by exact name (per the brief); the
 * rest are created on first datapoint. */
export const METRIC_SPECS = {
  weight: { name: "Body weight", unit: "kg", direction: "lower-better", domain: "health" },
  steps: { name: "Steps", unit: "count", direction: "higher-better", domain: "health" },
  sleepHours: { name: "Sleep hours", unit: "h", direction: "target-range", domain: "health" },
  sleepDeep: { name: "Sleep deep", unit: "min", direction: "target-range", domain: "health" },
  sleepRem: { name: "Sleep REM", unit: "min", direction: "target-range", domain: "health" },
  sleepLight: { name: "Sleep light", unit: "min", direction: "target-range", domain: "health" },
  sleepAwake: { name: "Sleep awake", unit: "min", direction: "lower-better", domain: "health" },
  restingHr: { name: "Resting heart rate", unit: "bpm", direction: "lower-better", domain: "health" },
  hrv: { name: "HRV", unit: "ms", direction: "higher-better", domain: "health" },
  spo2: { name: "SpO2", unit: "%", direction: "higher-better", domain: "health" },
  calories: { name: "Calories", unit: "kcal", direction: "target-range", domain: "health" },
  protein: { name: "Protein", unit: "g", direction: "higher-better", domain: "health" },
  carbs: { name: "Carbs", unit: "g", direction: "target-range", domain: "health" },
  fat: { name: "Fat", unit: "g", direction: "target-range", domain: "health" },
} as const satisfies Record<string, MetricSpec>;

export type MetricKey = keyof typeof METRIC_SPECS;

// --- data types we subscribe to ---------------------------------------------

/** Subscription names (subscriberConfigs.dataTypes) ↔ URL path segments
 * (kebab) ↔ filter prefixes (snake). All three spellings are the API's own
 * convention, not ours. */
export const DATA_TYPES = {
  steps: { path: "steps", filter: "steps", daily: false, reconcile: true },
  weight: { path: "weight", filter: "weight", daily: false, reconcile: false },
  sleep: { path: "sleep", filter: "sleep", daily: false, reconcile: false },
  dailyRestingHeartRate: {
    path: "daily-resting-heart-rate", filter: "daily_resting_heart_rate", daily: true, reconcile: false,
  },
  dailyHeartRateVariability: {
    path: "daily-heart-rate-variability", filter: "daily_heart_rate_variability", daily: true, reconcile: false,
  },
  dailyOxygenSaturation: {
    path: "daily-oxygen-saturation", filter: "daily_oxygen_saturation", daily: true, reconcile: false,
  },
  nutritionLog: { path: "nutrition-log", filter: "nutrition_log", daily: false, reconcile: false },
  exercise: { path: "exercise", filter: "exercise", daily: false, reconcile: false },
} as const;

export type DataTypeKey = keyof typeof DATA_TYPES;

export const SUBSCRIBED_DATA_TYPES = Object.keys(DATA_TYPES) as DataTypeKey[];

export const isSubscribedDataType = (v: string): v is DataTypeKey =>
  v in DATA_TYPES;

// --- mappers: provider datapoint JSON → rows --------------------------------

/** One Metric write produced by mapping a provider datapoint. */
export type MetricWrite = {
  metric: MetricKey;
  /** `${datapointName}#facet` when one provider record fans out (sleep,
   * nutrition); the bare resource name otherwise. */
  externalId: string;
  timestamp: Date;
  value: number;
};

/** One Event write for a (non-gym) exercise session. */
export type EventWrite = {
  externalId: string;
  title: string;
  start: Date;
  end: Date | null;
  /** Set when the session was skipped as gym-shaped — surfaced in sync stats. */
  excluded?: boolean;
};

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Rec) : null;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const when = (v: unknown): Date | null => {
  const s = str(v);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
};

/** Read a body's `interval`, tolerating both the flat `{startTime, endTime}`
 * shape (datapoint resources) and the `{physicalTimeInterval: {...}}` nesting
 * (notification payloads). */
const intervalOf = (body: Rec | null): { start: Date; end: Date | null } | null => {
  const iv = rec(body?.interval);
  if (!iv) return null;
  const phys = rec(iv.physicalTimeInterval) ?? iv;
  const start = when(phys.startTime);
  if (!start) return null;
  return { start, end: when(phys.endTime) };
};

/** Datapoint resource name — the provider's stable id. */
export const dpName = (dp: Rec): string | null => str(dp.name);

/** weight: {sampleTime, weightGrams} → Body weight (kg). */
export function mapWeight(dp: Rec): MetricWrite[] {
  const name = dpName(dp);
  const w = rec(dp.weight);
  const grams = num(w?.weightGrams);
  const at = when(w?.sampleTime);
  if (!name || grams === null || !at) return [];
  return [{ metric: "weight", externalId: name, timestamp: at, value: grams / 1000 }];
}

const DAILY_MAP: Partial<Record<DataTypeKey, { field: string; metric: MetricKey; pick: string }>> = {
  dailyRestingHeartRate: { field: "dailyRestingHeartRate", metric: "restingHr", pick: "beatsPerMinute" },
  dailyHeartRateVariability: {
    field: "dailyHeartRateVariability", metric: "hrv", pick: "averageHeartRateVariabilityMilliseconds",
  },
  dailyOxygenSaturation: { field: "dailyOxygenSaturation", metric: "spo2", pick: "averagePercentage" },
};

/** daily-* types: {date, <value field>} → one datapoint on that civil date. */
export function mapDaily(type: DataTypeKey, dp: Rec): MetricWrite[] {
  const spec = DAILY_MAP[type];
  const name = dpName(dp);
  if (!spec || !name) return [];
  const body = rec(dp[spec.field]);
  const value = num(body?.[spec.pick]);
  const date = str(body?.date);
  if (value === null || !date) return [];
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return [];
  return [{ metric: spec.metric, externalId: name, timestamp: new Date(y, m - 1, d), value }];
}

/**
 * sleep: session with stagesSummary → duration + per-stage minutes, all
 * timestamped at the session END (the wake-up), so a 23:00→07:00 night lands
 * on the morning's date — "sleep for the night ending on D".
 */
export function mapSleep(dp: Rec): MetricWrite[] {
  const name = dpName(dp);
  const s = rec(dp.sleep);
  if (!name || !s) return [];
  const iv = intervalOf(s);
  const at = iv?.end ?? iv?.start;
  if (!at) return [];

  const out: MetricWrite[] = [];
  const summary = rec(s.summary);
  const asleepMin = num(summary?.minutesAsleep);
  if (asleepMin !== null) {
    out.push({ metric: "sleepHours", externalId: `${name}#duration`, timestamp: at, value: asleepMin / 60 });
  }
  const stages = Array.isArray(summary?.stagesSummary) ? summary.stagesSummary : [];
  const STAGE: Record<string, MetricKey> = {
    DEEP: "sleepDeep", REM: "sleepRem", LIGHT: "sleepLight", AWAKE: "sleepAwake",
  };
  for (const raw of stages) {
    const st = rec(raw);
    const kind = str(st?.type)?.toUpperCase();
    if (!kind) continue;
    const minutes = num(st?.minutes);
    const metric = STAGE[kind];
    if (metric && minutes !== null) {
      out.push({ metric, externalId: `${name}#${kind.toLowerCase()}`, timestamp: at, value: minutes });
    }
  }
  return out;
}

/** nutritionLog: energy + macros → four facet datapoints per log entry. */
export function mapNutrition(dp: Rec): MetricWrite[] {
  const name = dpName(dp);
  const n = rec(dp.nutritionLog);
  if (!name || !n) return [];
  const iv = intervalOf(n);
  if (!iv) return [];
  const at = iv.start;

  const out: MetricWrite[] = [];
  const qty = (v: unknown): number | null => num(rec(v)?.value);

  const kcal = qty(n.energy);
  if (kcal !== null) out.push({ metric: "calories", externalId: `${name}#kcal`, timestamp: at, value: kcal });
  const carbs = qty(n.totalCarbohydrate);
  if (carbs !== null) out.push({ metric: "carbs", externalId: `${name}#carbs`, timestamp: at, value: carbs });
  const fat = qty(n.totalFat);
  if (fat !== null) out.push({ metric: "fat", externalId: `${name}#fat`, timestamp: at, value: fat });

  const nutrients = Array.isArray(n.nutrients) ? n.nutrients : [];
  for (const raw of nutrients) {
    const item = rec(raw);
    if (str(item?.nutrient)?.toUpperCase() === "PROTEIN") {
      const g = qty(item?.quantity);
      if (g !== null) out.push({ metric: "protein", externalId: `${name}#protein`, timestamp: at, value: g });
    }
  }
  return out;
}

const pretty = (exerciseType: string): string =>
  exerciseType
    .toLowerCase()
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");

/** exercise: session → Event, UNLESS the type is gym-shaped (config above). */
export function mapExercise(dp: Rec): EventWrite | null {
  const name = dpName(dp);
  const e = rec(dp.exercise);
  if (!name || !e) return null;
  const type = str(e.exerciseType);
  const iv = intervalOf(e);
  if (!type || !iv) return null;
  if (isExcludedExerciseType(type)) {
    return { externalId: name, title: type, start: iv.start, end: iv.end, excluded: true };
  }
  return {
    externalId: name,
    title: str(e.displayName) ?? pretty(type),
    start: iv.start,
    end: iv.end,
  };
}

/** steps datapoints (reconciled) → per-civil-day totals. Returns date→count.
 * The caller turns each day into ONE Steps datapoint with external id
 * `steps/{date}` — deterministic per day, so redeliveries and re-syncs
 * replace rather than append. */
export function sumStepsByDay(dps: Rec[]): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const dp of dps) {
    const s = rec(dp.steps);
    const count = num(s?.count);
    const iv = intervalOf(s);
    if (count === null || !iv) continue;
    const d = iv.start;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    byDay.set(key, (byDay.get(key) ?? 0) + count);
  }
  return byDay;
}
