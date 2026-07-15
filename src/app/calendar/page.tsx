import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { DayList } from "@/components/calendar/day-list";
import { MonthGrid } from "@/components/calendar/month-grid";
import { QuickAddEvent } from "@/components/calendar/quick-add";
import { CalendarToolbar } from "@/components/calendar/toolbar";
import { WeekGrid } from "@/components/calendar/week-grid";
import { requireUser } from "@/lib/auth";
import {
  isCalendarView,
  monthGridDates,
  viewRange,
  weekDates,
  type CalendarView,
} from "@/lib/calendar";
import { listEventsInRange } from "@/lib/data/events";
import { isValidISODate, todayISO } from "@/lib/dates";
import type { EventItem } from "@/lib/event-utils";

export const metadata: Metadata = { title: "LIFEOS — CALENDAR" };

const groupByDate = (events: EventItem[]): Map<string, EventItem[]> => {
  const map = new Map<string, EventItem[]>();
  for (const e of events) {
    const list = map.get(e.dateISO);
    if (list) list.push(e);
    else map.set(e.dateISO, [e]);
  }
  return map;
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const view: CalendarView =
    params.view && isCalendarView(params.view) ? params.view : "week";
  const today = todayISO();
  const date =
    params.date && isValidISODate(params.date) ? params.date : today;

  const { from, to } = viewRange(view, date);
  const events = await listEventsInRange(user.id, from, to);
  const byDate = groupByDate(events);

  return (
    <>
      <AppHeader active="calendar" />
      <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 p-4">
        <CalendarToolbar view={view} date={date} />
        <QuickAddEvent defaultDate={date} />
        {view === "week" && (
          <WeekGrid days={weekDates(date)} eventsByDate={byDate} today={today} />
        )}
        {view === "month" && (
          <MonthGrid cells={monthGridDates(date)} eventsByDate={byDate} today={today} />
        )}
        {view === "day" && (
          <DayList events={byDate.get(date) ?? []} dateISO={date} today={today} />
        )}
      </main>
    </>
  );
}
