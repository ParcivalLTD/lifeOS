"use server";

import { requireUser } from "@/lib/auth";
import { buildTabData } from "@/lib/data/tab-data-server";
import type { AnyTabData, TabParams, TrackTabKey } from "@/lib/tab-data";
import { TRACK_TABS } from "@/lib/tab-data";

const isTrackTab = (v: string): v is TrackTabKey =>
  TRACK_TABS.some((t) => t.key === v);

/**
 * Client-cache fill for the co-mounted track: refresh the settled tab,
 * pre-load new neighbors, re-range the calendar. Auth + forUser scoping
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
