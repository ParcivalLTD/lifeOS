"use server";

import { requireUser } from "@/lib/auth";
import { buildTabData } from "@/lib/data/tab-data-server";
import type { AnyTabData, TabParams, TrackTabKey } from "@/lib/tab-data";
import { TRACK_TABS } from "@/lib/tab-data";

const isTrackTab = (v: string): v is TrackTabKey =>
  TRACK_TABS.some((t) => t.key === v);

/**
 * Batched client-cache fill: several tabs in one round-trip. Server actions
 * serialize per client, so N separate calls would queue behind each other —
 * one call fetches every requested tab in parallel server-side.
 */
export async function getTabsDataAction(
  tabs: string[],
): Promise<Partial<Record<TrackTabKey, AnyTabData>>> {
  const user = await requireUser();
  const keys = [...new Set(tabs)].filter(isTrackTab).slice(0, TRACK_TABS.length);
  const results = await Promise.all(keys.map((k) => buildTabData(user.id, k, {})));
  const out: Partial<Record<TrackTabKey, AnyTabData>> = {};
  keys.forEach((k, i) => (out[k] = results[i]));
  return out;
}

/**
 * Single-tab fill with params (calendar re-ranging). Auth + forUser scoping
 * inside — the client only ever names a tab.
 */
export async function getTabDataAction(
  tab: string,
  params?: TabParams,
): Promise<AnyTabData | null> {
  const user = await requireUser();
  if (!isTrackTab(tab)) return null;
  const clean: TabParams = {
    view: typeof params?.view === "string" ? params.view.slice(0, 12) : undefined,
    date: typeof params?.date === "string" ? params.date.slice(0, 10) : undefined,
    session: typeof params?.session === "string" ? params.session.slice(0, 64) : undefined,
    lift: typeof params?.lift === "string" ? params.lift.slice(0, 60) : undefined,
  };
  return buildTabData(user.id, tab, clean);
}
