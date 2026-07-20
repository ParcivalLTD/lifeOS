"use client";

import { useState, useTransition } from "react";
import { getTabDataAction } from "@/app/tabs-actions";
import { MonthGrid } from "@/components/calendar/month-grid";
import { QuickAddEvent } from "@/components/calendar/quick-add";
import { TimeGrid } from "@/components/calendar/time-grid";
import {
  monthGridDates,
  rangeLabel,
  stepDate,
  weekDates,
  type CalendarView as View,
} from "@/lib/calendar";
import { DOMAIN_DOT_CLASS, DOMAINS } from "@/lib/domains";
import type { EventItem } from "@/lib/event-utils";
import type { CalendarData } from "@/lib/tab-data";

const btnBase =
  "whitespace-nowrap px-2 py-2 min-h-[44px] font-mono text-[10px] font-semibold uppercase tracking-[.06em] cursor-pointer sm:px-2.5 sm:py-1.5 sm:min-h-0";
const btnIdle = `${btnBase} border border-border-input bg-subtle text-ink`;
const btnActive = `${btnBase} border border-ink bg-ink text-[#ffffff]`;
const VIEWS: View[] = ["month", "week", "day"];

const groupByDate = (events: EventItem[]): Map<string, EventItem[]> => {
  const map = new Map<string, EventItem[]>();
  for (const e of events) {
    const list = map.get(e.dateISO);
    if (list) list.push(e);
    else map.set(e.dateISO, [e]);
  }
  return map;
};

/**
 * Calendar inside the co-mounted track. The toolbar is client state (a Link
 * here would remount the whole track); range changes fetch via the tab-data
 * action and mirror into the URL with replaceState so deep links stay honest.
 * Grid-internal links (day numbers, +N MORE, event rows) remain real
 * navigations — infrequent, and they land back on the track correctly.
 */
export function CalendarViewTab({ data, active }: { data: CalendarData; active: boolean }) {
  const [state, setState] = useState<CalendarData>(data);
  const [pending, startTransition] = useTransition();

  // a server action revalidated and the shell merged a fresh calendar DTO:
  // adopt it when it covers the range being shown (e.g. quick-add on the
  // current week); a locally-browsed other range keeps its own fetched data
  const [seenProp, setSeenProp] = useState(data);
  if (seenProp !== data) {
    setSeenProp(data);
    if (data.view === state.view && data.date === state.date) setState(data);
  }

  const load = (view: View, date: string) => {
    startTransition(async () => {
      const fresh = (await getTabDataAction("calendar", { view, date })) as CalendarData | null;
      if (fresh) {
        setState(fresh);
        if (active) {
          const q = new URLSearchParams({ view: fresh.view, date: fresh.date });
          window.history.replaceState(null, "", `/calendar?${q}`);
        }
      }
    });
  };

  const byDate = groupByDate(state.events);

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 p-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={`font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faint ${pending ? "opacity-60" : ""}`}>
            {rangeLabel(state.view, state.date)}
          </span>
          <div className="flex-1" />
          <div className="flex gap-1">
            <button type="button" aria-label="Previous" className={btnIdle} onClick={() => load(state.view, stepDate(state.view, state.date, -1))}>‹</button>
            <button type="button" className={btnIdle} onClick={() => load(state.view, state.todayISO)}>Today</button>
            <button type="button" aria-label="Next" className={btnIdle} onClick={() => load(state.view, stepDate(state.view, state.date, 1))}>›</button>
          </div>
          <div className="flex gap-1">
            {VIEWS.map((v) => (
              <button key={v} type="button" className={v === state.view ? btnActive : btnIdle} onClick={() => load(v, state.date)}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="hidden flex-wrap gap-x-3 gap-y-1 sm:flex">
          {DOMAINS.map((d) => (
            <span key={d} className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase text-muted">
              <span className={`h-[7px] w-[7px] ${DOMAIN_DOT_CLASS[d]}`} />
              {d}
            </span>
          ))}
        </div>
      </div>

      <QuickAddEvent defaultDate={state.date} />

      {/* week and day share one hour-grid timeline; month keeps its own grid */}
      {state.view === "week" && (
        <TimeGrid days={weekDates(state.date)} eventsByDate={byDate} today={state.todayISO} />
      )}
      {state.view === "month" && (
        <MonthGrid cells={monthGridDates(state.date)} eventsByDate={byDate} today={state.todayISO} />
      )}
      {state.view === "day" && (
        <TimeGrid days={[state.date]} eventsByDate={byDate} today={state.todayISO} />
      )}
    </main>
  );
}
