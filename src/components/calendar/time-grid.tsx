"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { dowLabelOf } from "@/lib/calendar";
import {
  blockDetail,
  blockGeometry,
  HOUR_PX,
  hourLabel,
  layoutDay,
  visibleRange,
} from "@/lib/calendar-timeline";
import { parseISODate } from "@/lib/dates";
import type { Domain } from "@/lib/domains";
import type { EventItem } from "@/lib/event-utils";
import { Dot } from "./event-bits";

/** Domain-tinted block: washed fill + a solid 2px domain edge (FR-CAL.1).
 * Static strings so Tailwind sees them, same pattern as DOMAIN_DOT_CLASS. */
const DOMAIN_BLOCK_CLASS: Record<Domain, string> = {
  personal: "bg-domain-personal/10 border-l-domain-personal",
  academic: "bg-domain-academic/10 border-l-domain-academic",
  work: "bg-domain-work/10 border-l-domain-work",
  finance: "bg-domain-finance/10 border-l-domain-finance",
  gym: "bg-domain-gym/10 border-l-domain-gym",
  health: "bg-domain-health/10 border-l-domain-health",
};

const GUTTER = 46; // px — fixed-width hour-label column

/** Ticks every minute so the line stays honest; null until mounted so the
 * server and client render the same thing. */
function useNowMin(): number | null {
  const [min, setMin] = useState<number | null>(null);
  useEffect(() => {
    const read = () => {
      const d = new Date();
      setMin(d.getHours() * 60 + d.getMinutes());
    };
    read();
    const id = setInterval(read, 60_000);
    return () => clearInterval(id);
  }, []);
  return min;
}

/** All-day chip, sized for the strip: full-width target (the column) but a
 * short row, so a day with three bills doesn't push the timed grid off screen. */
function AllDayChip({ event }: { event: EventItem }) {
  return (
    <Link
      href={`/events/${event.id}`}
      title={event.title}
      className="flex min-h-[26px] min-w-0 items-center gap-1.5 border border-[#e2e2da] bg-subtle px-1.5 py-[3px] text-[11px] no-underline"
    >
      <Dot domain={event.domain} />
      <span className="truncate">{event.title}</span>
    </Link>
  );
}

function EventBlock({
  placed,
  fromHour,
  past,
}: {
  placed: ReturnType<typeof layoutDay>[number];
  fromHour: number;
  past: boolean;
}) {
  const { event, col, cols } = placed;
  const { top, height } = blockGeometry(placed, fromHour);
  const detail = blockDetail(height);

  return (
    <Link
      href={`/events/${event.id}`}
      title={`${event.timeHM}${event.endHM ? `–${event.endHM}` : ""} ${event.title}`}
      style={{
        top,
        height,
        left: `${(col / cols) * 100}%`,
        width: `${(1 / cols) * 100}%`,
      }}
      className={`absolute overflow-hidden border-l-2 px-1 no-underline ${
        DOMAIN_BLOCK_CLASS[event.domain]
      } ${past ? "opacity-45" : ""}`}
    >
      {/* the inner box owns the 1px gutter between neighbouring columns, so
          the block's own width stays an honest fraction of the slot */}
      <span className="block h-full min-w-0 pr-px">
        {detail === "full" && (
          <span className="block truncate font-mono text-[9px] leading-[13px] text-muted">
            {event.timeHM}
            {event.endHM ? `–${event.endHM}` : ""}
          </span>
        )}
        <span
          className={`block truncate ${
            detail === "tiny" ? "text-[9px] leading-[13px]" : "text-[11px] leading-[14px]"
          }`}
        >
          {event.title}
        </span>
      </span>
    </Link>
  );
}

/**
 * The week/day hour grid: a vertical timeline where every event is positioned
 * AND sized by its real start/end, overlaps tile side by side, and all-day
 * items live in their own strip above the timed area rather than pretending
 * to occupy a time.
 *
 * One component serves both views — week passes seven days, day passes one.
 * Columns always fill the available width (a plain `1fr` grid, no fixed or
 * minimum pixel width, no internal horizontal scroll): responsive on any
 * viewport, from a wide desktop panel down to a narrow phone, where columns
 * simply get narrower and titles truncate harder rather than triggering a
 * scrollbar. Paging to the next/prev day or week is a horizontal swipe,
 * handled one level up in CalendarViewTab — not a scroll gesture here.
 * Month view is untouched.
 */
export function TimeGrid({
  days,
  eventsByDate,
  today,
}: {
  days: string[];
  eventsByDate: Map<string, EventItem[]>;
  today: string;
}) {
  const nowMin = useNowMin();
  const perDay = days.map((d) => eventsByDate.get(d) ?? []);
  const { fromHour, toHour } = visibleRange(perDay);
  const hours = Array.from({ length: toHour - fromHour }, (_, i) => fromHour + i);
  const gridHeight = hours.length * HOUR_PX;

  const allDayRows = perDay.map((events) => events.filter((e) => e.allDay));
  const hasAllDay = allDayRows.some((r) => r.length > 0);

  // Every column shares the remaining width evenly. `minmax(0, 1fr)` (not
  // `auto`) is what lets a column shrink below its content's natural size —
  // a long all-day chip (min-w-0 + truncate) never stretches its column.
  const cols = {
    display: "grid",
    gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
  } as const;

  return (
    <div className="border border-border-outer bg-surface">
      {/* day headers — today inverted, matching the month grid */}
      <div className="flex border-b border-border-header">
        <div
          className="flex-none border-r border-border-row bg-surface"
          style={{ width: GUTTER }}
        />
        <div className="flex-1" style={cols}>
          {days.map((dateISO) => {
            const isToday = dateISO === today;
            return (
              <div
                key={dateISO}
                className={`flex items-baseline justify-between gap-1 border-l border-border-row px-2 py-1.5 ${
                  isToday ? "bg-ink text-[#ffffff]" : "bg-subtle"
                }`}
              >
                <span className="font-mono text-[10px] font-semibold tracking-[.08em]">
                  {dowLabelOf(dateISO)}
                </span>
                <span className="font-mono text-[11px] font-semibold">
                  {parseISODate(dateISO).getDate()}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* all-day strip — bills, deadlines, birthdays; never in the timed area */}
      {hasAllDay && (
        <div className="flex border-b border-border-header">
          <div
            className="flex-none border-r border-border-row bg-surface px-1 py-1.5 font-mono text-[8px] font-semibold uppercase tracking-[.04em] whitespace-nowrap text-faint"
            style={{ width: GUTTER }}
          >
            All-day
          </div>
          <div className="flex-1" style={cols}>
            {days.map((dateISO, i) => (
              <div
                key={dateISO}
                className="flex min-w-0 flex-col gap-1 border-l border-border-row p-1"
              >
                {allDayRows[i].map((e) => (
                  <AllDayChip key={e.id} event={e} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* the hour grid */}
      <div className="flex">
        <div
          className="flex-none border-r border-border-row bg-surface"
          style={{ width: GUTTER, height: gridHeight }}
        >
          {hours.map((h, i) => (
            <div
              key={h}
              className="absolute right-1 font-mono text-[9px] leading-none text-faint"
              // -4px lifts the label onto its hour line rather than below it
              style={{ top: i * HOUR_PX - 4 }}
            >
              {hourLabel(h)}
            </div>
          ))}
        </div>

        <div className="relative flex-1" style={{ ...cols, height: gridHeight }}>
          {/* hour rules, drawn once across the whole timed area */}
          <div className="pointer-events-none absolute inset-0">
            {hours.map((h, i) => (
              <div
                key={h}
                className="absolute inset-x-0 border-t border-border-row"
                style={{ top: i * HOUR_PX }}
              />
            ))}
          </div>

          {days.map((dateISO, i) => {
            const placed = layoutDay(perDay[i]);
            const isToday = dateISO === today;
            return (
              <div key={dateISO} className="relative border-l border-border-row">
                {placed.map((p) => (
                  <EventBlock
                    key={p.event.id}
                    placed={p}
                    fromHour={fromHour}
                    past={dateISO < today}
                  />
                ))}

                {/* current-time indicator, today's column only */}
                {isToday &&
                  nowMin !== null &&
                  nowMin >= fromHour * 60 &&
                  nowMin <= toHour * 60 && (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 z-10 border-t border-ink"
                      style={{ top: ((nowMin - fromHour * 60) / 60) * HOUR_PX }}
                    >
                      <span className="absolute left-0 top-[-2px] h-[5px] w-[5px] bg-ink" />
                    </div>
                  )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
