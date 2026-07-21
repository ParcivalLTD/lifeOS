/**
 * Owner preferences — hub-and-spoke, no private table.
 *
 * All preferences live in ONE Event (`domain=personal`, `kind=other`,
 * `payload.pref = {...}`), the same row the daily-nudge toggle has always
 * used. `calendarVisible` excludes the `pref` key, so it never surfaces as a
 * schedule item.
 *
 * ⚠️ Every write goes through `patchPreferences`, which MERGES. An earlier
 * version replaced the whole `pref` object, which was fine while it held a
 * single field but would silently wipe a sibling preference the moment a
 * second one existed — toggling the nudge would have reset the model choice.
 * Add new preferences as fields here; never write the row directly.
 */
import { and, eq, sql } from "drizzle-orm";
import { forUser } from "@/db";
import { events } from "@/db/schema";
import type { ProviderId, Tier } from "@/lib/ai/providers/types";

export type Preferences = {
  /** Daily nudge on the dashboard. Absent = ON (the historical default). */
  nudgeEnabled?: boolean;
  /** Assistant provider + capability tier, chosen in Settings. Absent =
   * fall back to the first configured provider / the balanced tier. */
  aiProvider?: ProviderId;
  aiTier?: Tier;
};

type PrefPayload = { pref: Preferences };

const isPref = sql`${events.payload} is not null and jsonb_exists(${events.payload}, 'pref')`;

async function prefRow(userId: string) {
  const rows = await forUser(userId).select(events, {
    where: and(eq(events.archived, false), isPref),
  });
  return rows[0] ?? null;
}

/** The whole preference object; `{}` when nothing has ever been set. */
export async function getPreferences(userId: string): Promise<Preferences> {
  const row = await prefRow(userId);
  return row ? ((row.payload as PrefPayload).pref ?? {}) : {};
}

/**
 * Merge a partial update into the single preference row, creating it on
 * first write. Only the named keys change; every sibling is preserved.
 */
export async function patchPreferences(
  userId: string,
  patch: Preferences,
): Promise<void> {
  const udb = forUser(userId);
  const row = await prefRow(userId);
  const current = row ? ((row.payload as PrefPayload).pref ?? {}) : {};
  const payload: PrefPayload = { pref: { ...current, ...patch } };

  if (row) {
    await udb.update(events, { payload }, eq(events.id, row.id));
  } else {
    await udb.insert(events, {
      domain: "personal",
      kind: "other",
      title: "Preferences",
      start: new Date(),
      payload,
    });
  }
}
