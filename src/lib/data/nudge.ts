/**
 * Daily-nudge storage (Phase 4 step 3, FR-AI.3) — hub-and-spoke, no private
 * tables:
 *
 * - **Today's nudge is cached as an Event** (`domain=personal`, `kind=other`,
 *   `payload.nudge = {date, text}`) — one per day; re-generating replaces it.
 *   `calendarVisible` excludes the `nudge` key so it never hits the calendar.
 *   The cache is why the API is called AT MOST once per day (NFR-5): the
 *   dashboard reads this, and only generates when the day has no row yet.
 * - **The enable/disable preference is an Event** (`payload.pref =
 *   {nudgeEnabled}`) — a single upserted row; default is ON when absent.
 *   `calendarVisible` excludes the `pref` key too.
 *
 * All reads/writes via forUser. This module never calls the API — generation
 * lives in `lib/ai/nudge.ts`.
 */
import { and, eq, sql } from "drizzle-orm";
import { forUser } from "@/db";
import { events } from "@/db/schema";
import { parseISODate, toISODate } from "@/lib/dates";

type NudgePayload = { nudge: { date: string; text: string } };
type PrefPayload = { pref: { nudgeEnabled: boolean } };

const isNudge = sql`${events.payload} is not null and jsonb_exists(${events.payload}, 'nudge')`;
const isPref = sql`${events.payload} is not null and jsonb_exists(${events.payload}, 'pref')`;
const nudgeDateIs = (iso: string) => sql`(${events.payload} -> 'nudge' ->> 'date') = ${iso}`;

/** Today's cached nudge text, or null if none has been generated today. */
export async function getTodayNudge(userId: string): Promise<{ text: string } | null> {
  const today = toISODate(new Date());
  const rows = await forUser(userId).select(events, {
    where: and(eq(events.archived, false), isNudge, nudgeDateIs(today)),
  });
  const row = rows[0];
  return row ? { text: (row.payload as NudgePayload).nudge.text } : null;
}

/** Store today's nudge (replaces any existing row for today — one per day). */
export async function saveTodayNudge(userId: string, text: string): Promise<void> {
  const udb = forUser(userId);
  const today = toISODate(new Date());
  const existing = await udb.select(events, { where: and(isNudge, nudgeDateIs(today)) });
  const payload: NudgePayload = { nudge: { date: today, text } };
  if (existing[0]) {
    await udb.update(events, { payload }, eq(events.id, existing[0].id));
  } else {
    await udb.insert(events, {
      domain: "personal",
      kind: "other",
      title: `Daily nudge — ${today}`,
      start: parseISODate(today),
      allDay: true,
      payload,
    });
  }
}

/** Whether the daily nudge is enabled. Default ON (no row = enabled). */
export async function getNudgeEnabled(userId: string): Promise<boolean> {
  const rows = await forUser(userId).select(events, {
    where: and(eq(events.archived, false), isPref),
  });
  const row = rows[0];
  return row ? (row.payload as PrefPayload).pref.nudgeEnabled : true;
}

export async function setNudgeEnabled(userId: string, enabled: boolean): Promise<void> {
  const udb = forUser(userId);
  const existing = await udb.select(events, { where: isPref });
  const payload: PrefPayload = { pref: { nudgeEnabled: enabled } };
  if (existing[0]) {
    await udb.update(events, { payload }, eq(events.id, existing[0].id));
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
