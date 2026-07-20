import Link from "next/link";
import { dowLabels } from "@/lib/calendar";
import { parseISODate } from "@/lib/dates";
import { DOMAIN_DOT_CLASS } from "@/lib/domains";
import type { EventItem } from "@/lib/event-utils";

const MAX_ROWS = 3;

/**
 * Dense 7-column month. Cells link into the day view; on small screens event
 * titles collapse to square domain dots so the grid stays readable.
 */
export function MonthGrid({
  cells,
  eventsByDate,
  today,
}: {
  cells: { dateISO: string; inMonth: boolean }[];
  eventsByDate: Map<string, EventItem[]>;
  today: string;
}) {
  return (
    <div>
      <div className="grid grid-cols-7 gap-px sm:gap-1 pb-1">
        {dowLabels().map((d) => (
          <span
            key={d}
            className="px-0.5 sm:px-1 text-right font-mono text-[8px] sm:text-[9px] font-semibold tracking-[.08em] text-faint"
          >
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px sm:gap-1">
        {cells.map(({ dateISO, inMonth }) => {
          const isToday = dateISO === today;
          const dayEvents = eventsByDate.get(dateISO) ?? [];
          const shown = dayEvents.slice(0, MAX_ROWS);
          const more = dayEvents.length - shown.length;
          return (
            <div
              key={dateISO}
              className={`min-h-[52px] overflow-hidden border border-border-outer sm:min-h-[92px] ${
                inMonth ? "bg-surface" : "bg-subtle"
              }`}
            >
              <div className="flex justify-end px-1 pt-1">
                <Link
                  href={`/calendar?view=day&date=${dateISO}`}
                  className={`inline-flex min-h-[28px] min-w-[28px] items-center justify-center font-mono text-[10px] sm:text-[11px] font-semibold no-underline ${
                    isToday
                      ? "bg-ink text-[#ffffff]"
                      : inMonth
                        ? "text-ink"
                        : "text-faintest"
                  }`}
                >
                  {parseISODate(dateISO).getDate()}
                </Link>
              </div>
              <div className="flex flex-col gap-px px-1 pb-1">
                {/* phones: domain dot + truncated title, ≥44px tap target */}
                <div className="flex flex-col gap-px sm:hidden">
                  {shown.map((e) => (
                    <Link
                      key={e.id}
                      href={`/events/${e.id}`}
                      className={`flex min-h-[22px] min-w-0 items-center gap-1 no-underline ${
                        dateISO < today ? "opacity-45" : ""
                      }`}
                    >
                      <span className={`h-[5px] w-[5px] flex-none ${DOMAIN_DOT_CLASS[e.domain]}`} />
                      <span className="truncate text-[9px] leading-tight">{e.title}</span>
                    </Link>
                  ))}
                </div>
                {/* ≥sm: dot + truncated title */}
                <div className="hidden sm:flex sm:flex-col sm:gap-px">
                  {shown.map((e) => (
                    <Link
                      key={e.id}
                      href={`/events/${e.id}`}
                      className={`flex min-w-0 items-center gap-1 no-underline ${
                        dateISO < today ? "opacity-45" : ""
                      }`}
                    >
                      <span className={`h-[6px] w-[6px] flex-none ${DOMAIN_DOT_CLASS[e.domain]}`} />
                      <span className="truncate text-[10.5px]">{e.title}</span>
                    </Link>
                  ))}
                </div>
                {more > 0 && (
                  <Link
                    href={`/calendar?view=day&date=${dateISO}`}
                    className="font-mono text-[9px] tracking-[.05em] text-faint no-underline"
                  >
                    +{more} MORE
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
