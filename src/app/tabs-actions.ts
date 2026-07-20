"use server";

import { requireUser } from "@/lib/auth";
import { buildTabData } from "@/lib/data/tab-data-server";
import type { AnyTabData, TabParams, TrackViewKey } from "@/lib/tab-data";
import { isTrackView, TRACK_VIEW_KEYS } from "@/lib/tab-data";

/**
 * Batched client-cache fill: several views in one round-trip. Server actions
 * serialize per client, so N separate calls would queue behind each other —
 * one call fetches every requested view in parallel server-side. Keyed by
 * view, not tab: a segmented tab caches each of its segments independently.
 */
export async function getTabsDataAction(
  views: string[],
): Promise<Partial<Record<TrackViewKey, AnyTabData>>> {
  const user = await requireUser();
  const keys = [...new Set(views)].filter(isTrackView).slice(0, TRACK_VIEW_KEYS.length);
  const results = await Promise.all(keys.map((k) => buildTabData(user.id, k, {})));
  const out: Partial<Record<TrackViewKey, AnyTabData>> = {};
  keys.forEach((k, i) => (out[k] = results[i]));
  return out;
}

/**
 * Single-view fill with params (calendar re-ranging). Auth + forUser scoping
 * inside — the client only ever names a view.
 */
export async function getTabDataAction(
  view: string,
  params?: TabParams,
): Promise<AnyTabData | null> {
  const user = await requireUser();
  if (!isTrackView(view)) return null;
  const clean: TabParams = {
    view: typeof params?.view === "string" ? params.view.slice(0, 12) : undefined,
    date: typeof params?.date === "string" ? params.date.slice(0, 10) : undefined,
    session: typeof params?.session === "string" ? params.session.slice(0, 64) : undefined,
    lift: typeof params?.lift === "string" ? params.lift.slice(0, 60) : undefined,
  };
  return buildTabData(user.id, view, clean);
}
