import Link from "next/link";
import { Dot, splitDay } from "@/components/calendar/event-bits";
import { Panel } from "@/components/panel";
import { timeSlotLabel, type EventItem } from "@/lib/event-utils";

/**
 * Today's events across all domains (FR-DASH.1). Server-rendered; rows open
 * the event editor (FR-DASH.2 "open event"). Past timed events dim.
 */
export function SchedulePanel({
  events,
  nowHM,
}: {
  events: EventItem[];
  nowHM: string;
}) {
  const { allDay, timed } = splitDay(events);
  const ordered = [...allDay, ...timed];

  return (
    <Panel
      label="Schedule"
      value={`${events.length} event${events.length === 1 ? "" : "s"}`}
    >
      {ordered.length === 0 && (
        <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
          No events today
        </p>
      )}
      {ordered.map((e) => {
        const past = !e.allDay && (e.endHM ?? e.timeHM ?? "99:99") < nowHM;
        return (
          <Link
            key={e.id}
            href={`/events/${e.id}`}
            className={`flex items-baseline gap-2.5 border-b border-border-row px-3 py-2 no-underline ${
              past ? "opacity-45" : ""
            }`}
          >
            <span className="w-[58px] flex-none font-mono text-[11px] text-muted">
              {timeSlotLabel(e)}
            </span>
            <Dot domain={e.domain} size={7} />
            <span className="min-w-0 flex-1 truncate text-[12.5px]">
              {e.title}
            </span>
            <span className="flex-none font-mono text-[10px] uppercase text-faint">
              {e.domain}
            </span>
          </Link>
        );
      })}
    </Panel>
  );
}
