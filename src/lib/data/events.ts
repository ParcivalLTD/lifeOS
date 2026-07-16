import { and, eq, gte, lt, sql } from "drizzle-orm";
import { forUser } from "@/db";
import { events } from "@/db/schema";
import { parseISODate, toISODate } from "@/lib/dates";
import type { EventItem, EventKind } from "@/lib/event-utils";
import type { Domain } from "@/lib/domains";

const hm = (d: Date): string =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

const toItem = (row: typeof events.$inferSelect): EventItem => ({
  id: row.id,
  title: row.title,
  domain: row.domain,
  kind: row.kind,
  allDay: row.allDay,
  dateISO: toISODate(row.start),
  timeHM: row.allDay ? null : hm(row.start),
  endHM:
    !row.allDay && row.end && toISODate(row.end) === toISODate(row.start)
      ? hm(row.end)
      : null,
  hasPayload: row.payload != null,
});

/**
 * Excludes workout templates — Events carrying payload.isTemplate=true are
 * reusable definitions, not scheduled occurrences, so they never appear on the
 * calendar or dashboard (the Gym module fetches them separately).
 */
export const notATemplate = sql`(${events.payload} ->> 'isTemplate') is distinct from 'true'`;

/** Events starting within [fromISO, toISOExclusive), oldest first. */
export async function listEventsInRange(
  userId: string,
  fromISO: string,
  toISOExclusive: string,
): Promise<EventItem[]> {
  const rows = await forUser(userId).select(events, {
    where: and(
      eq(events.archived, false),
      notATemplate,
      gte(events.start, parseISODate(fromISO)),
      lt(events.start, parseISODate(toISOExclusive)),
    ),
    orderBy: [events.start],
  });
  return rows.map(toItem);
}

export async function getEvent(
  userId: string,
  eventId: string,
): Promise<EventItem | null> {
  const [row] = await forUser(userId).select(events, {
    where: eq(events.id, eventId),
  });
  return row && !row.archived ? toItem(row) : null;
}

export type EventInput = {
  title: string;
  domain: Domain;
  kind: EventKind;
  dateISO: string;
  /** null → all-day. */
  timeHM: string | null;
  endHM: string | null;
};

const toTimestamps = (input: EventInput) => {
  const start = parseISODate(input.dateISO);
  let end: Date | null = null;
  if (input.timeHM) {
    const [h, m] = input.timeHM.split(":").map(Number);
    start.setHours(h, m, 0, 0);
    if (input.endHM && input.endHM > input.timeHM) {
      end = parseISODate(input.dateISO);
      const [eh, em] = input.endHM.split(":").map(Number);
      end.setHours(eh, em, 0, 0);
    }
  }
  return { start, end, allDay: !input.timeHM };
};

export async function createEvent(
  userId: string,
  input: EventInput,
): Promise<EventItem> {
  const { start, end, allDay } = toTimestamps(input);
  const [row] = await forUser(userId).insert(events, {
    title: input.title,
    domain: input.domain,
    kind: input.kind,
    start,
    end,
    allDay,
  });
  return toItem(row);
}

/** Updates core fields; payload and goal link are preserved untouched. */
export async function updateEvent(
  userId: string,
  eventId: string,
  input: EventInput,
): Promise<void> {
  const { start, end, allDay } = toTimestamps(input);
  await forUser(userId).update(
    events,
    {
      title: input.title,
      domain: input.domain,
      kind: input.kind,
      start,
      end,
      allDay,
    },
    eq(events.id, eventId),
  );
}

/** Soft delete — archived events disappear from every view but stay in the DB. */
export async function archiveEvent(userId: string, eventId: string): Promise<void> {
  await forUser(userId).update(events, { archived: true }, eq(events.id, eventId));
}
