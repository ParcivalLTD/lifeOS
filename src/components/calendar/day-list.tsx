import Link from "next/link";
import { Panel } from "@/components/panel";
import type { EventItem } from "@/lib/event-utils";
import { KIND_LABEL, timeSlotLabel } from "@/lib/event-utils";
import { Dot, splitDay } from "./event-bits";

/** Single-day agenda: all-day first, then timed rows. Rows open the editor. */
export function DayList({
  events,
  dateISO,
  today,
}: {
  events: EventItem[];
  dateISO: string;
  today: string;
}) {
  const { allDay, timed } = splitDay(events);
  const ordered = [...allDay, ...timed];

  return (
    <Panel label="Schedule" value={`${events.length} event${events.length === 1 ? "" : "s"}`}>
      {ordered.length === 0 && (
        <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
          No events
        </p>
      )}
      {ordered.map((e) => (
        <Link
          key={e.id}
          href={`/events/${e.id}`}
          className={`flex min-h-[44px] items-center gap-2.5 border-b border-border-row px-3 py-2 no-underline sm:min-h-0 sm:items-baseline ${
            dateISO < today ? "opacity-45" : ""
          }`}
        >
          <span className="w-[58px] flex-none font-mono text-[11px] text-muted">
            {timeSlotLabel(e)}
          </span>
          <Dot domain={e.domain} size={7} />
          <span className="min-w-0 flex-1 truncate text-[12.5px]">
            {e.title}
            {e.endHM ? (
              <span className="font-mono text-[10px] text-faint"> – {e.endHM}</span>
            ) : null}
          </span>
          <span className="flex-none font-mono text-[10px] uppercase text-faint">
            {KIND_LABEL[e.kind]}
          </span>
        </Link>
      ))}
    </Panel>
  );
}
