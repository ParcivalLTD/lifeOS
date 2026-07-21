import "server-only";

import { and, eq, gte, inArray } from "drizzle-orm";
import { forUser } from "@/db";
import { habitCompletions, habits, metricDatapoints, metrics } from "@/db/schema";
import { getGHealthConnection, type GHealthStatus } from "@/lib/data/ghealth";
import { gymDaysInRange } from "@/lib/data/gym";
import { METRIC_SPECS, type MetricKey } from "@/lib/ghealth/mapping";
import { addDaysISO, todayISO } from "@/lib/dates";
import { isScheduledOn } from "@/lib/habits";
import { analyzeSleep, type DayOutcome, type SleepAnalysis, type SleepNightData } from "@/lib/sleep";

/**
 * Health module reads (FR-HLTH.1/.3). Pure metric-shape views — every series
 * comes off the SAME Metric rows regardless of who wrote them (manual "native"
 * logs and "google_health" synced datapoints interleave freely). The metric
 * catalogue (names/units) is `METRIC_SPECS` in lib/ghealth/mapping.ts so the
 * sync and the UI can never disagree about what "Sleep hours" is called.
 */

export type HealthDayPoint = { dateISO: string; value: number };

export type SleepNight = {
  dateISO: string;
  hours: number | null;
  /** stage minutes; null when the night has no stage breakdown */
  deepMin: number | null;
  remMin: number | null;
  lightMin: number | null;
  awakeMin: number | null;
};

export type NutritionDay = {
  dateISO: string;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

export type HealthOverview = {
  todayISO: string;
  weight: {
    series: HealthDayPoint[]; // last value per day, 90-day window
    latest: number | null;
    /** change vs the oldest point within the trailing 30 days */
    delta30: number | null;
  };
  sleep: { nights: SleepNight[]; avg7: number | null }; // last 14 nights
  steps: { series: HealthDayPoint[]; today: number | null; avg7: number | null }; // 14 days
  heart: {
    resting: HealthDayPoint[]; // 30 days
    hrv: HealthDayPoint[];
    spo2: HealthDayPoint[];
    restingLatest: number | null;
    hrvLatest: number | null;
    spo2Latest: number | null;
  };
  nutrition: { days: NutritionDay[]; today: NutritionDay | null }; // 7 days
  /** stage-4 sleep analysis over the trailing 30 nights (honesty-rule output) */
  sleepAnalysis: SleepAnalysis;
  /** Google Health connection surface for the header line (null = never connected). */
  ghealth: { status: GHealthStatus; lastSyncAt: string | null } | null;
};

const isoDayOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type Row = { key: MetricKey; dateISO: string; value: number; timestamp: Date; source: string | null };

/** All health-catalogue datapoints since `fromISO`, tagged with their key. */
async function healthRows(userId: string, fromISO: string): Promise<Row[]> {
  const udb = forUser(userId);
  const keys = Object.keys(METRIC_SPECS) as MetricKey[];
  const names = keys.map((k) => METRIC_SPECS[k].name);
  const metricRows = await udb.select(metrics, {
    where: and(eq(metrics.domain, "health"), inArray(metrics.name, names)),
  });
  if (metricRows.length === 0) return [];
  const keyById = new Map<string, MetricKey>();
  for (const m of metricRows) {
    const key = keys.find((k) => METRIC_SPECS[k].name === m.name);
    if (key) keyById.set(m.id, key);
  }
  const points = await udb.select(metricDatapoints, {
    where: and(
      inArray(metricDatapoints.metricId, metricRows.map((m) => m.id)),
      gte(metricDatapoints.timestamp, new Date(`${fromISO}T00:00:00`)),
    ),
    orderBy: [metricDatapoints.timestamp],
  });
  return points.flatMap((p) => {
    const key = keyById.get(p.metricId);
    if (!key) return [];
    const value = Number(p.value);
    if (!Number.isFinite(value)) return [];
    return [{ key, dateISO: isoDayOf(p.timestamp), value, timestamp: p.timestamp, source: p.source }];
  });
}

/** Last value per day for one key (ordered input → later rows win). */
function lastPerDay(rows: Row[], key: MetricKey): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) if (r.key === key) out.set(r.dateISO, r.value);
  return out;
}

/** Sum per day for one key (nutrition: many meals a day add up). */
function sumPerDay(rows: Row[], key: MetricKey): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) if (r.key === key) out.set(r.dateISO, (out.get(r.dateISO) ?? 0) + r.value);
  return out;
}

const toSeries = (m: Map<string, number>): HealthDayPoint[] =>
  [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dateISO, value]) => ({ dateISO, value }));

const round1 = (n: number) => Math.round(n * 10) / 10;

/** SleepNightData for the analysis window: one night per wake-up day. A
 * night's wake time is REAL only when the duration row was synced (its
 * timestamp is the session end); manual noon-stamped logs stay date-only. */
function nightsFrom(rows: Row[], fromISO: string): SleepNightData[] {
  const byDay = new Map<string, SleepNightData>();
  const night = (d: string): SleepNightData => {
    let n = byDay.get(d);
    if (!n) {
      byDay.set(d, (n = { dateISO: d, hours: null, deepMin: null, remMin: null, lightMin: null, awakeMin: null, wakeAt: null }));
    }
    return n;
  };
  for (const r of rows) {
    if (r.dateISO < fromISO) continue;
    const n = night(r.dateISO);
    switch (r.key) {
      case "sleepHours":
        n.hours = r.value;
        n.wakeAt = r.source === "google_health" ? r.timestamp.toISOString() : null;
        break;
      case "sleepDeep": n.deepMin = r.value; break;
      case "sleepRem": n.remMin = r.value; break;
      case "sleepLight": n.lightMin = r.value; break;
      case "sleepAwake": n.awakeMin = r.value; break;
      default: break;
    }
  }
  return [...byDay.values()].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
}

/** Same-day adherence outcomes for the pattern check — the modules' own
 * numbers (habit completions, gym sessions), read-only. */
async function dayOutcomes(userId: string, fromISO: string, today: string): Promise<DayOutcome[]> {
  const udb = forUser(userId);
  const [habitRows, completions, gymDays] = await Promise.all([
    udb.select(habits, { where: eq(habits.archived, false) }),
    udb.select(habitCompletions, { where: gte(habitCompletions.date, fromISO) }),
    gymDaysInRange(userId, fromISO, addDaysISO(today, 1)),
  ]);
  const doneByDay = new Map<string, Set<string>>();
  for (const c of completions) {
    if (c.status !== "done") continue;
    let set = doneByDay.get(c.date);
    if (!set) doneByDay.set(c.date, (set = new Set()));
    set.add(c.habitId);
  }
  const gymByDay = new Map(gymDays.map((g) => [g.dateISO, g.done]));
  const out: DayOutcome[] = [];
  for (let d = fromISO; d <= today; d = addDaysISO(d, 1)) {
    const scheduled = habitRows.filter((h) => isScheduledOn(h.schedule, d));
    const done = doneByDay.get(d) ?? new Set<string>();
    out.push({
      dateISO: d,
      habitsScheduled: scheduled.length,
      habitsDone: scheduled.filter((h) => done.has(h.id)).length,
      gymDone: gymByDay.has(d) ? gymByDay.get(d)! : null,
    });
  }
  return out;
}

export async function healthOverview(userId: string): Promise<HealthOverview> {
  const today = todayISO();
  const [rows, conn, outcomes] = await Promise.all([
    healthRows(userId, addDaysISO(today, -90)),
    getGHealthConnection(userId),
    dayOutcomes(userId, addDaysISO(today, -29), today),
  ]);

  // weight — last value per day over 90 days; delta vs 30 days back
  const weightSeries = toSeries(lastPerDay(rows, "weight"));
  const latestW = weightSeries[weightSeries.length - 1]?.value ?? null;
  const cutoff30 = addDaysISO(today, -30);
  const base30 = weightSeries.find((p) => p.dateISO >= cutoff30)?.value ?? null;
  const delta30 =
    latestW !== null && base30 !== null && weightSeries.filter((p) => p.dateISO >= cutoff30).length > 1
      ? round1(latestW - base30)
      : null;

  // sleep — last 14 nights, stages joined onto the same night
  const from14 = addDaysISO(today, -13);
  const hours = lastPerDay(rows, "sleepHours");
  const deep = lastPerDay(rows, "sleepDeep");
  const rem = lastPerDay(rows, "sleepRem");
  const light = lastPerDay(rows, "sleepLight");
  const awake = lastPerDay(rows, "sleepAwake");
  const nightKeys = [...new Set([...hours.keys(), ...deep.keys(), ...rem.keys(), ...light.keys()])]
    .filter((d) => d >= from14)
    .sort();
  const nights: SleepNight[] = nightKeys.map((d) => ({
    dateISO: d,
    hours: hours.get(d) ?? null,
    deepMin: deep.get(d) ?? null,
    remMin: rem.get(d) ?? null,
    lightMin: light.get(d) ?? null,
    awakeMin: awake.get(d) ?? null,
  }));
  const from7 = addDaysISO(today, -6);
  const last7h = nights.filter((n) => n.dateISO >= from7 && n.hours !== null);
  const avg7 =
    last7h.length > 0 ? round1(last7h.reduce((s, n) => s + (n.hours ?? 0), 0) / last7h.length) : null;

  // steps — 14 days
  const stepsAll = lastPerDay(rows, "steps");
  const stepsSeries = toSeries(stepsAll).filter((p) => p.dateISO >= from14);
  const steps7 = stepsSeries.filter((p) => p.dateISO >= from7);
  const stepsAvg7 =
    steps7.length > 0 ? Math.round(steps7.reduce((s, p) => s + p.value, 0) / steps7.length) : null;

  // heart & oxygen — 30 days
  const heartOf = (key: MetricKey) =>
    toSeries(lastPerDay(rows, key)).filter((p) => p.dateISO >= cutoff30);
  const resting = heartOf("restingHr");
  const hrv = heartOf("hrv");
  const spo2 = heartOf("spo2");

  // nutrition — 7 days, meals summed per day
  const from7n = addDaysISO(today, -6);
  const kcal = sumPerDay(rows, "calories");
  const protein = sumPerDay(rows, "protein");
  const carbs = sumPerDay(rows, "carbs");
  const fat = sumPerDay(rows, "fat");
  const nutritionKeys = [...new Set([...kcal.keys(), ...protein.keys(), ...carbs.keys(), ...fat.keys()])]
    .filter((d) => d >= from7n)
    .sort();
  const days: NutritionDay[] = nutritionKeys.map((d) => ({
    dateISO: d,
    kcal: kcal.has(d) ? Math.round(kcal.get(d)!) : null,
    protein: protein.has(d) ? round1(protein.get(d)!) : null,
    carbs: carbs.has(d) ? round1(carbs.get(d)!) : null,
    fat: fat.has(d) ? round1(fat.get(d)!) : null,
  }));

  return {
    todayISO: today,
    weight: { series: weightSeries, latest: latestW, delta30 },
    sleep: { nights, avg7 },
    steps: {
      series: stepsSeries,
      today: stepsAll.get(today) ?? null,
      avg7: stepsAvg7,
    },
    heart: {
      resting,
      hrv,
      spo2,
      restingLatest: resting[resting.length - 1]?.value ?? null,
      hrvLatest: hrv[hrv.length - 1]?.value ?? null,
      spo2Latest: spo2[spo2.length - 1]?.value ?? null,
    },
    nutrition: { days, today: days.find((d) => d.dateISO === today) ?? null },
    sleepAnalysis: analyzeSleep(
      nightsFrom(rows, addDaysISO(today, -29)),
      outcomes,
      today,
      addDaysISO,
    ),
    ghealth: conn ? { status: conn.status, lastSyncAt: conn.lastSyncAt ?? null } : null,
  };
}

// --- manual logging (FR-HLTH.1 — capture is sacred) ---------------------------

const MANUAL_KEYS = ["weight", "sleepHours"] as const;
export type ManualHealthKey = (typeof MANUAL_KEYS)[number];
export const isManualHealthKey = (k: string): k is ManualHealthKey =>
  (MANUAL_KEYS as readonly string[]).includes(k);

/**
 * Append a manual datapoint (source "native", no external id — never collides
 * with the sync's upsert space). Timestamped noon of the chosen day so it
 * buckets onto that civil day in every timezone the series is read in.
 */
export async function logHealthDatapoint(
  userId: string,
  key: ManualHealthKey,
  value: number,
  dateISO: string,
): Promise<void> {
  const udb = forUser(userId);
  const spec = METRIC_SPECS[key];
  let [metric] = await udb.select(metrics, {
    where: and(eq(metrics.domain, "health"), eq(metrics.name, spec.name)),
  });
  if (!metric) {
    [metric] = await udb.insert(metrics, {
      domain: spec.domain,
      name: spec.name,
      unit: spec.unit,
      direction: spec.direction,
    });
  }
  await udb.insert(metricDatapoints, {
    metricId: metric.id,
    timestamp: new Date(`${dateISO}T12:00:00`),
    value,
    source: "native",
  });
}
