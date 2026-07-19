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
 * Keeps only real scheduled occurrences on the calendar/dashboard. Excludes
 * module Events that live in the Event table but aren't schedule items:
 * gym templates (payload.isTemplate=true), finance records (payload has a
 * `fin` key), academic course definitions (payload has an `acad` key), and
 * work achievements (payload.work="achievement" — log entries, not dates to
 * plan around), and stored review snapshots (payload has a `rev` key).
 * Generated bill occurrences, assessment deadlines, study sessions, and
 * project deadlines (payload.work="project") stay visible.
 */
export const calendarVisible = sql`
  (${events.payload} ->> 'isTemplate') is distinct from 'true'
  and (${events.payload} ->> 'work') is distinct from 'achievement'
  and (${events.payload} is null or not (
    jsonb_exists(${events.payload}, 'fin')
    or jsonb_exists(${events.payload}, 'acad')
    or jsonb_exists(${events.payload}, 'rev')
  ))
`;

/** Events starting within [fromISO, toISOExclusive), oldest first. */
export async function listEventsInRange(
  userId: string,
  fromISO: string,
  toISOExclusive: string,
): Promise<EventItem[]> {
  const rows = await forUser(userId).select(events, {
    where: and(
      eq(events.archived, false),
      calendarVisible,
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
