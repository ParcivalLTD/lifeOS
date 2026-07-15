import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
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

/** Events starting within [fromISO, toISOExclusive), oldest first. */
export async function listEventsInRange(
  userId: string,
  fromISO: string,
  toISOExclusive: string,
): Promise<EventItem[]> {
  const rows = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.userId, userId),
        eq(events.archived, false),
        gte(events.start, parseISODate(fromISO)),
        lt(events.start, parseISODate(toISOExclusive)),
      ),
    )
    .orderBy(events.start);
  return rows.map(toItem);
}

export async function getEvent(
  userId: string,
  eventId: string,
): Promise<EventItem | null> {
  const [row] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.userId, userId)));
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
  const [row] = await db
    .insert(events)
    .values({
      userId,
      title: input.title,
      domain: input.domain,
      kind: input.kind,
      start,
      end,
      allDay,
    })
    .returning();
  return toItem(row);
}

/** Updates core fields; payload and goal link are preserved untouched. */
export async function updateEvent(
  userId: string,
  eventId: string,
  input: EventInput,
): Promise<void> {
  const { start, end, allDay } = toTimestamps(input);
  await db
    .update(events)
    .set({
      title: input.title,
      domain: input.domain,
      kind: input.kind,
      start,
      end,
      allDay,
    })
    .where(and(eq(events.id, eventId), eq(events.userId, userId)));
}

/** Soft delete — archived events disappear from every view but stay in the DB. */
export async function archiveEvent(userId: string, eventId: string): Promise<void> {
  await db
    .update(events)
    .set({ archived: true })
    .where(and(eq(events.id, eventId), eq(events.userId, userId)));
}
