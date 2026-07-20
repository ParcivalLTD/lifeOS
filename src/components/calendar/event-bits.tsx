import { DOMAIN_DOT_CLASS } from "@/lib/domains";
import type { EventItem } from "@/lib/event-utils";

export const Dot = ({ domain, size = 6 }: { domain: EventItem["domain"]; size?: number }) => (
  <span
    className={`flex-none self-center ${DOMAIN_DOT_CLASS[domain]}`}
    style={{ width: size, height: size }}
  />
);

/** Splits one day's events into all-day items and time-sorted rows.
 * The calendar's week/day views now lay timed events out on an hour grid
 * (lib/calendar-timeline.ts); this remains for the dashboard agenda panel. */
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
