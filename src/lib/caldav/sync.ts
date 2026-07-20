import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { forUser } from "@/db";
import { events } from "@/db/schema";
import {
  CalDavAuthError,
  listCalendars,
  listEvents,
  type CalDavCredentials,
} from "./client";
import type { VEvent } from "./ical";
import { credentials, markBroken, recordSync } from "@/lib/data/caldav";

/**
 * One-way sync pass: iCloud → Helm. Nothing is ever pushed back (see the
 * read-only guarantee in client.ts).
 *
 * Every occurrence is UPSERTED on (user_id, source, external_id) — the
 * partial unique index added in migration 0004 — so re-running this over an
 * unchanged calendar updates rows in place and creates nothing. The Event
 * row remains an ordinary Event: it shows on the calendar and dashboard like
 * any other, it just isn't editable-as-truth because iCloud owns it.
 */

/** How much of the calendar to mirror. Past is kept short (history is mostly
 * noise); the future window covers a year of planning. */
const PAST_DAYS = 90;
const FUTURE_DAYS = 365;

export type SyncSummary = {
  created: number;
  updated: number;
  errors: number;
  calendars: number;
  /** Per-calendar detail, useful when one calendar fails and others succeed. */
  details: { calendar: string; events: number; error?: string }[];
};

export type SyncOutcome =
  | { ok: true; summary: SyncSummary }
  | { ok: false; reason: "not-connected" | "auth-failed" | "error"; message: string };

const window = (now: Date) => ({
  from: new Date(now.getTime() - PAST_DAYS * 86_400_000),
  to: new Date(now.getTime() + FUTURE_DAYS * 86_400_000),
});

/**
 * Map one iCloud occurrence onto the core Event shape (§7.4).
 *
 * Imported events get domain=personal / kind=appointment: an external
 * calendar carries no domain semantics, and inventing one (guessing "gym"
 * from a title) would be fabricating data. The owner can re-domain a row
 * afterwards; sync will not stomp it — see the upsert's `set` list.
 */
function toRow(v: VEvent, calendarUrl: string) {
  return {
    domain: "personal" as const,
    kind: "appointment" as const,
    title: v.summary,
    start: v.start,
    end: v.end,
    allDay: v.allDay,
    source: "apple_calendar" as const,
    externalId: v.externalId,
    externalCalendarId: calendarUrl,
  };
}

/** Run one full sync pass for a user. Never throws — always reports. */
export async function syncAppleCalendar(userId: string): Promise<SyncOutcome> {
  const creds = await credentials(userId);
  if (!creds) {
    return { ok: false, reason: "not-connected", message: "Apple Calendar is not connected." };
  }

  const davCreds: CalDavCredentials = {
    appleId: creds.appleId,
    password: creds.password,
    baseUrl: creds.baseUrl,
  };

  let calendars;
  try {
    calendars = await listCalendars(davCreds);
  } catch (err) {
    if (err instanceof CalDavAuthError) {
      // The single most likely failure in normal operation: the owner revoked
      // the app-specific password at appleid.apple.com. Record it so Settings
      // can ask for a reconnect instead of silently retrying forever.
      await markBroken(userId, err.message);
      return { ok: false, reason: "auth-failed", message: err.message };
    }
    const message = err instanceof Error ? err.message : "calendar discovery failed";
    await markBroken(userId, message);
    return { ok: false, reason: "error", message };
  }

  const { from, to } = window(new Date());
  const udb = forUser(userId);
  const summary: SyncSummary = {
    created: 0, updated: 0, errors: 0, calendars: calendars.length, details: [],
  };

  for (const cal of calendars) {
    try {
      const occurrences = await listEvents(davCreds, cal.url, from, to);
      let count = 0;

      for (const v of occurrences) {
        try {
          if (v.cancelled) {
            // A cancelled occurrence should disappear from Helm too, but we
            // archive rather than delete — same soft-delete convention as
            // tasks/habits, and it keeps any local links intact.
            await udb.update(
              events,
              { archived: true },
              and(
                eq(events.source, "apple_calendar"),
                eq(events.externalId, v.externalId),
              )!,
            );
            continue;
          }

          const existing = await udb.select(events, {
            where: and(
              eq(events.source, "apple_calendar"),
              eq(events.externalId, v.externalId),
            ),
          });

          await udb.insert(events, toRow(v, cal.url), {
            onConflict: {
              target: [events.userId, events.source, events.externalId],
              targetWhere: sql`${events.externalId} is not null`,
              // Only the fields iCloud owns. domain/kind/goalId are NOT reset,
              // so an owner who re-domains an imported event or links it to a
              // goal keeps that through every later sync.
              set: {
                title: v.summary,
                start: v.start,
                end: v.end,
                allDay: v.allDay,
                externalCalendarId: cal.url,
                archived: false,
                updatedAt: new Date(),
              },
            },
          });

          if (existing.length > 0) summary.updated++;
          else summary.created++;
          count++;
        } catch (err) {
          // one malformed event must not abort the calendar
          summary.errors++;
          console.error("caldav: event upsert failed", err);
        }
      }

      summary.details.push({ calendar: cal.displayName, events: count });
    } catch (err) {
      if (err instanceof CalDavAuthError) {
        await markBroken(userId, err.message);
        return { ok: false, reason: "auth-failed", message: err.message };
      }
      summary.errors++;
      const message = err instanceof Error ? err.message : "calendar sync failed";
      summary.details.push({ calendar: cal.displayName, events: 0, error: message });
      console.error("caldav: calendar sync failed", cal.displayName, err);
    }
  }

  await recordSync(userId, {
    created: summary.created,
    updated: summary.updated,
    errors: summary.errors,
    calendars: summary.calendars,
  });
  return { ok: true, summary };
}
