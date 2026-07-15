import { dowLabelOf } from "@/lib/calendar";
import { parseISODate } from "@/lib/dates";
import type { EventItem } from "@/lib/event-utils";
import { AllDayChip, splitDay, TimedRow } from "./event-bits";

/** Mockup week strip: auto-fit day cards, today's header inverted. */
export function WeekGrid({
  days,
  eventsByDate,
  today,
}: {
  days: string[];
  eventsByDate: Map<string, EventItem[]>;
  today: string;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] items-stretch gap-2">
      {days.map((dateISO) => {
        const isToday = dateISO === today;
        const { allDay, timed } = splitDay(eventsByDate.get(dateISO) ?? []);
        return (
          <div key={dateISO} className="min-h-[190px] border border-border-outer bg-surface">
            <div
              className={`flex justify-between border-b px-2 py-1.5 ${
                isToday
                  ? "border-ink bg-ink text-[#ffffff]"
                  : "border-border-header bg-subtle"
              }`}
            >
              <span className="font-mono text-[10px] font-semibold tracking-[.08em]">
                {dowLabelOf(dateISO)}
              </span>
              <span className="font-mono text-[11px] font-semibold">
                {parseISODate(dateISO).getDate()}
              </span>
            </div>
            <div className="flex flex-col gap-1 p-2">
              {allDay.map((e) => (
                <AllDayChip key={e.id} event={e} />
              ))}
              {timed.map((e) => (
                <TimedRow key={e.id} event={e} past={dateISO < today} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
