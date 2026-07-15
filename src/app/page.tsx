import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { HabitsCard } from "@/components/dashboard/habits-card";
import { NudgeBanner } from "@/components/dashboard/nudge-banner";
import { Phase2Card } from "@/components/dashboard/phase2-card";
import { SchedulePanel } from "@/components/dashboard/schedule-panel";
import { TasksCard } from "@/components/dashboard/tasks-card";
import { requireUser } from "@/lib/auth";
import { monthNameOf } from "@/lib/calendar";
import { listEventsInRange } from "@/lib/data/events";
import { listHabitsWithStats } from "@/lib/data/habits";
import { listTasks } from "@/lib/data/tasks";
import { addDaysISO, todayISO } from "@/lib/dates";

export const metadata: Metadata = { title: "LIFEOS — TODAY" };

export default async function TodayDashboard() {
  const user = await requireUser();
  const today = todayISO();

  // one parallel round trip — the dashboard is the product (FR-DASH.3)
  const [tasks, habitsOverview, todaysEvents] = await Promise.all([
    listTasks(user.id),
    listHabitsWithStats(user.id, today),
    listEventsInRange(user.id, today, addDaysISO(today, 1)),
  ]);

  const openTasks = tasks.filter((t) => t.status === "open");
  const scheduledHabits = habitsOverview.habits.filter((h) => h.scheduledToday);
  const now = new Date();
  const nowHM = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;

  return (
    <>
      <AppHeader active="today" />
      <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 p-4">
        <NudgeBanner />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-3">
          <SchedulePanel events={todaysEvents} nowHM={nowHM} />
          <TasksCard
            tasks={openTasks.slice(0, 3)}
            openCount={openTasks.length}
            today={today}
          />
          <HabitsCard
            habits={scheduledHabits}
            adherence7={habitsOverview.adherence7}
          />
          <Phase2Card
            label={`Budget — ${monthNameOf(today)}`}
            blurb="Monthly budgets and ≤10-second expense capture ship with the Finance module."
          />
          <Phase2Card
            label="Workout"
            blurb="Programs, session logging and PRs ship with the Gym module."
          />
        </div>
      </main>
    </>
  );
}
