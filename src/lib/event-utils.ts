/** Pure event helpers shared by server data layer and forms. */
import { eventKindEnum } from "@/db/schema";
import type { Domain } from "./domains";

export type EventKind = (typeof eventKindEnum.enumValues)[number];

export const EVENT_KINDS = eventKindEnum.enumValues;

export const isEventKind = (v: string): v is EventKind =>
  (EVENT_KINDS as readonly string[]).includes(v);

/** Short mono chip labels per kind. */
export const KIND_LABEL: Record<EventKind, string> = {
  appointment: "APPT",
  deadline: "DEADLINE",
  session: "SESSION",
  bill: "BILL",
  birthday: "BDAY",
  other: "OTHER",
};

/** Serializable event shape for calendar views + edit form. */
export type EventItem = {
  id: string;
  title: string;
  domain: Domain;
  kind: EventKind;
  allDay: boolean;
  /** Local date of the event's start. */
  dateISO: string;
  /** "07:00" for timed events, null when all-day. */
  timeHM: string | null;
  /** "08:00" when an end time exists on the same day, else null. */
  endHM: string | null;
  hasPayload: boolean;
};

/** Time-column label in day view: bills/deadlines read "DUE". */
export function timeSlotLabel(e: EventItem): string {
  if (!e.allDay) return e.timeHM ?? "";
  return e.kind === "bill" || e.kind === "deadline" ? "DUE" : "ALL-DAY";
}

export const isValidHM = (s: string): boolean =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
