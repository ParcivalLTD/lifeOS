import Link from "next/link";
import { DOMAIN_DOT_CLASS } from "@/lib/domains";
import type { EventItem } from "@/lib/event-utils";

export const Dot = ({ domain, size = 6 }: { domain: EventItem["domain"]; size?: number }) => (
  <span
    className={`flex-none self-center ${DOMAIN_DOT_CLASS[domain]}`}
    style={{ width: size, height: size }}
  />
);

/** All-day chip (bills, birthdays, deadlines) — bordered, subtle bg. */
export function AllDayChip({ event }: { event: EventItem }) {
  return (
    <Link
      href={`/events/${event.id}`}
      className="flex min-h-[44px] min-w-0 items-center gap-1.5 border border-[#e2e2da] bg-subtle px-1.5 py-1 text-[11px] no-underline sm:min-h-0 sm:py-[3px]"
    >
      <Dot domain={event.domain} />
      <span className="truncate">{event.title}</span>
    </Link>
  );
}

/** Timed row: time · dot · title. Past events dim to 45%. */
export function TimedRow({ event, past }: { event: EventItem; past: boolean }) {
  return (
    <Link
      href={`/events/${event.id}`}
      className={`flex min-h-[44px] min-w-0 items-center gap-1.5 no-underline sm:min-h-0 ${past ? "opacity-45" : ""}`}
    >
      <span className="w-[34px] flex-none font-mono text-[10px] text-faint">
        {event.timeHM}
      </span>
      <Dot domain={event.domain} />
      <span className="truncate text-[11.5px]">{event.title}</span>
    </Link>
  );
}

/** Splits one day's events into all-day chips and time-sorted rows. */
export function splitDay(events: EventItem[]): {
  allDay: EventItem[];
  timed: EventItem[];
} {
  return {
    allDay: events.filter((e) => e.allDay),
    timed: events
      .filter((e) => !e.allDay)
      .sort((a, b) => (a.timeHM! < b.timeHM! ? -1 : 1)),
  };
}
