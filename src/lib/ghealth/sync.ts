import "server-only";

import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { forUser } from "@/db";
import { events, metricDatapoints, metrics } from "@/db/schema";
import { markGHealthBroken, recordGHealthSync, refreshTokenOf } from "@/lib/data/ghealth";
import { GHealthAuthError, listDataPoints, mintAccessToken } from "./client";
import {
  DATA_TYPES,
  mapDaily,
  mapExercise,
  mapNutrition,
  mapSleep,
  mapWeight,
  METRIC_SPECS,
  sumStepsByDay,
  type DataTypeKey,
  type MetricKey,
  type MetricWrite,
} from "./mapping";
import type { WebhookNotification } from "./webhook";

/**
 * Webhook-driven sync: one notification names a data type + the time
 * intervals that changed; this module RE-SYNCS those intervals — fetch what
 * the provider now has, upsert it, and delete our synced rows that no longer
 * exist upstream. One code path serves both UPSERT and DELETE notifications
 * (a DELETE is just an interval whose refetch comes back smaller), and it is
 * idempotent by construction:
 *
 *  - metric rows upsert on (user_id, source='google_health', external_id)
 *    via the stage-1 partial unique index — a retried delivery re-writes the
 *    same rows;
 *  - exercise Events upsert on the same triple on the events table;
 *  - steps aggregate to ONE row per civil day (external id `steps/{date}`),
 *    recomputed from the RECONCILED stream (`:reconcile`, the server-side
 *    multi-source merge) so phone+watch never double-count.
 *
 * Gym-shaped exercise types are excluded per the flat config list in
 * mapping.ts — a watch-detected strength session must never collide with the
 * manually-logged Gym module.
 */

export type GHealthSyncStats = {
  upserted: number;
  deleted: number;
  errors: number;
  excludedExercises: number;
};

const SOURCE = "google_health";

const isoDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Civil-day span [firstDay, lastDay] touched by a physical interval, padded
 * one day each side so timezone skew can't drop edge datapoints. */
function daySpan(startISO: string, endISO: string): { first: string; last: string } {
  const start = new Date(Date.parse(startISO) - 86_400_000);
  const end = new Date(Date.parse(endISO) + 86_400_000);
  return { first: isoDay(start), last: isoDay(end) };
}

/** AIP-160 filter for a type over a civil-day span, using the API's
 * snake_case filter prefixes and per-shape time fields. */
function filterFor(type: DataTypeKey, first: string, last: string): string {
  const f = DATA_TYPES[type].filter;
  if (DATA_TYPES[type].daily) {
    return `${f}.date >= "${first}" AND ${f}.date <= "${last}"`;
  }
  if (type === "weight") {
    return `${f}.sample_time.civil_time >= "${first}T00:00:00" AND ${f}.sample_time.civil_time <= "${last}T23:59:59"`;
  }
  return `${f}.interval.civil_start_time >= "${first}T00:00:00" AND ${f}.interval.civil_start_time <= "${last}T23:59:59"`;
}

/** Find-or-create the Metric a key maps to; returns its id. Cached per call
 * batch by the caller. Reuses existing metrics by exact name (Body weight,
 * Sleep hours) per the brief. */
async function metricId(
  userId: string,
  key: MetricKey,
  cache: Map<MetricKey, string>,
): Promise<string> {
  const hit = cache.get(key);
  if (hit) return hit;
  const spec = METRIC_SPECS[key];
  const udb = forUser(userId);
  const existing = await udb.select(metrics, { where: eq(metrics.name, spec.name) });
  if (existing[0]) {
    cache.set(key, existing[0].id);
    return existing[0].id;
  }
  const [row] = await udb.insert(metrics, {
    domain: spec.domain,
    name: spec.name,
    unit: spec.unit,
    direction: spec.direction,
  });
  cache.set(key, row.id);
  return row.id;
}

async function upsertMetricWrites(
  userId: string,
  writes: MetricWrite[],
  cache: Map<MetricKey, string>,
  stats: GHealthSyncStats,
): Promise<Set<string>> {
  const udb = forUser(userId);
  const seen = new Set<string>();
  for (const w of writes) {
    const mid = await metricId(userId, w.metric, cache);
    await udb.insert(
      metricDatapoints,
      { metricId: mid, timestamp: w.timestamp, value: w.value, source: SOURCE, externalId: w.externalId },
      {
        onConflict: {
          target: [metricDatapoints.userId, metricDatapoints.source, metricDatapoints.externalId],
          targetWhere: sql`${metricDatapoints.externalId} is not null`,
          set: { metricId: mid, timestamp: w.timestamp, value: w.value },
        },
      },
    );
    stats.upserted++;
    seen.add(w.externalId);
  }
  return seen;
}

/** Delete synced rows for `metricKeys` inside the window that the refetch no
 * longer returned — this is how DELETE notifications (and corrections) land. */
async function pruneMetricRows(
  userId: string,
  metricKeys: MetricKey[],
  windowStart: Date,
  windowEnd: Date,
  keep: Set<string>,
  cache: Map<MetricKey, string>,
  stats: GHealthSyncStats,
): Promise<void> {
  const udb = forUser(userId);
  const ids: string[] = [];
  for (const key of metricKeys) ids.push(await metricId(userId, key, cache));
  const stale = await udb.select(metricDatapoints, {
    where: and(
      inArray(metricDatapoints.metricId, ids),
      eq(metricDatapoints.source, SOURCE),
      gte(metricDatapoints.timestamp, windowStart),
      lte(metricDatapoints.timestamp, windowEnd),
    ),
  });
  const gone = stale.filter((r) => r.externalId && !keep.has(r.externalId));
  if (gone.length > 0) {
    await udb.delete(
      metricDatapoints,
      inArray(
        metricDatapoints.id,
        gone.map((r) => r.id),
      ),
    );
    stats.deleted += gone.length;
  }
}

const METRICS_OF: Partial<Record<DataTypeKey, MetricKey[]>> = {
  weight: ["weight"],
  sleep: ["sleepHours", "sleepDeep", "sleepRem", "sleepLight", "sleepAwake"],
  dailyRestingHeartRate: ["restingHr"],
  dailyHeartRateVariability: ["hrv"],
  dailyOxygenSaturation: ["spo2"],
  nutritionLog: ["calories", "protein", "carbs", "fat"],
};

/** Sync one (dataType, interval) — fetch current truth, upsert, prune. */
async function syncInterval(
  userId: string,
  accessToken: string,
  type: DataTypeKey,
  startISO: string,
  endISO: string,
  cache: Map<MetricKey, string>,
  stats: GHealthSyncStats,
): Promise<void> {
  const { first, last } = daySpan(startISO, endISO);
  const dps = await listDataPoints(accessToken, {
    path: DATA_TYPES[type].path,
    filter: filterFor(type, first, last),
    reconcile: DATA_TYPES[type].reconcile,
  });

  const windowStart = new Date(`${first}T00:00:00`);
  const windowEnd = new Date(`${last}T23:59:59`);

  if (type === "steps") {
    // reconciled stream → one aggregate per civil day, replacing prior values
    const byDay = sumStepsByDay(dps);
    const writes: MetricWrite[] = [];
    let day = first;
    while (day <= last) {
      const [y, m, d] = day.split("-").map(Number);
      const total = byDay.get(day);
      if (total !== undefined) {
        // fresh Date per write — the cursor below is mutated for iteration
        writes.push({ metric: "steps", externalId: `steps/${day}`, timestamp: new Date(y, m - 1, d), value: total });
      }
      const cursor = new Date(y, m - 1, d);
      cursor.setDate(cursor.getDate() + 1);
      day = isoDay(cursor);
    }
    const keep = await upsertMetricWrites(userId, writes, cache, stats);
    await pruneMetricRows(userId, ["steps"], windowStart, windowEnd, keep, cache, stats);
    return;
  }

  if (type === "exercise") {
    const udb = forUser(userId);
    const keep = new Set<string>();
    for (const dp of dps) {
      const w = mapExercise(dp);
      if (!w) continue;
      if (w.excluded) {
        stats.excludedExercises++;
        continue; // gym-shaped: never written, and pruned below if it was
      }
      await udb.insert(
        events,
        {
          domain: "health",
          kind: "session",
          title: w.title,
          start: w.start,
          end: w.end,
          source: SOURCE,
          externalId: w.externalId,
        },
        {
          onConflict: {
            target: [events.userId, events.source, events.externalId],
            targetWhere: sql`${events.externalId} is not null`,
            // iCloud-sync rule applies here too: only provider-owned fields;
            // a re-domained or goal-linked session keeps the owner's edits
            set: { title: w.title, start: w.start, end: w.end, archived: false },
          },
        },
      );
      stats.upserted++;
      keep.add(w.externalId);
    }
    // prune synced sessions the provider no longer has in this window
    const stale = await udb.select(events, {
      where: and(
        eq(events.source, "google_health"),
        gte(events.start, windowStart),
        lte(events.start, windowEnd),
      ),
    });
    const gone = stale.filter((r) => r.externalId && !keep.has(r.externalId));
    for (const r of gone) {
      await udb.update(events, { archived: true }, eq(events.id, r.id));
      stats.deleted++;
    }
    return;
  }

  // plain metric types
  const mapper: (dp: Record<string, unknown>) => MetricWrite[] =
    type === "weight"
      ? mapWeight
      : type === "sleep"
        ? mapSleep
        : type === "nutritionLog"
          ? mapNutrition
          : (dp) => mapDaily(type, dp);
  const writes = dps.flatMap(mapper);
  const keep = await upsertMetricWrites(userId, writes, cache, stats);
  await pruneMetricRows(userId, METRICS_OF[type] ?? [], windowStart, windowEnd, keep, cache, stats);
}

/** Handle one verified webhook notification. Never throws — reports. */
export async function handleNotification(
  userId: string,
  notification: WebhookNotification,
): Promise<GHealthSyncStats | { authFailed: true }> {
  const stats: GHealthSyncStats = { upserted: 0, deleted: 0, errors: 0, excludedExercises: 0 };

  let accessToken: string;
  try {
    const refresh = await refreshTokenOf(userId);
    if (!refresh) return { authFailed: true };
    accessToken = await mintAccessToken(refresh);
  } catch (err) {
    if (err instanceof GHealthAuthError) {
      // revoked/expired refresh token — surface, never retry silently
      await markGHealthBroken(userId, err.message);
      return { authFailed: true };
    }
    throw err;
  }

  const cache = new Map<MetricKey, string>();
  for (const iv of notification.intervals) {
    try {
      await syncInterval(userId, accessToken, notification.dataType, iv.start, iv.end, cache, stats);
    } catch (err) {
      if (err instanceof GHealthAuthError) {
        await markGHealthBroken(userId, err.message);
        return { authFailed: true };
      }
      stats.errors++;
      console.error(`google health sync failed for ${notification.dataType}`, err);
    }
  }

  await recordGHealthSync(userId, {
    upserted: stats.upserted,
    deleted: stats.deleted,
    errors: stats.errors,
  });
  return stats;
}
