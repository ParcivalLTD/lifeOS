import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { BudgetCard } from "@/components/dashboard/budget-card";
import { GoalsCard } from "@/components/dashboard/goals-card";
import { HabitsCard } from "@/components/dashboard/habits-card";
import { NudgeBanner } from "@/components/dashboard/nudge-banner";
import { SchedulePanel } from "@/components/dashboard/schedule-panel";
import { TasksCard } from "@/components/dashboard/tasks-card";
import { WorkoutCard } from "@/components/dashboard/workout-card";
import { requireUser } from "@/lib/auth";
import { listEventsInRange } from "@/lib/data/events";
import { budgetVsActual } from "@/lib/data/finance";
import { topActiveGoals } from "@/lib/data/goals";
import { listSessions, thisWeekDays } from "@/lib/data/gym";
import { listHabitsWithStats } from "@/lib/data/habits";
import { listTasks } from "@/lib/data/tasks";
import { addDaysISO, todayISO } from "@/lib/dates";
import { currentMonthKey } from "@/lib/finance";

export const metadata: Metadata = { title: "LIFEOS — TODAY" };

export default async function TodayDashboard() {
  const user = await requireUser();
  const today = todayISO();
  const month = currentMonthKey();

  // one parallel round trip — the dashboard is the product (FR-DASH.3)
  const [tasks, habitsOverview, todaysEvents, goalsTop, bva, sessions, gymWeek] =
    await Promise.all([
      listTasks(user.id),
      listHabitsWithStats(user.id, today),
      listEventsInRange(user.id, today, addDaysISO(today, 1)),
      topActiveGoals(user.id, 4),
      budgetVsActual(user.id, month),
      listSessions(user.id, 5),
      thisWeekDays(user.id),
    ]);

  const openTasks = tasks.filter((t) => t.status === "open");
  const scheduledHabits = habitsOverview.habits.filter((h) => h.scheduledToday);
  const todaySession = sessions.find((s) => s.dateISO === today) ?? null;
  const now = new Date();
  const nowHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  return (
    <>
      <AppHeader active="today" />
      <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 p-4">
        <NudgeBanner />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-3">
          <SchedulePanel events={todaysEvents} nowHM={nowHM} />
          <TasksCard tasks={openTasks.slice(0, 3)} openCount={openTasks.length} today={today} />
          <HabitsCard habits={scheduledHabits} adherence7={habitsOverview.adherence7} />
          <GoalsCard goals={goalsTop.goals} activeCount={goalsTop.activeCount} />
          <BudgetCard rows={bva.rows} spent={bva.spent} cap={bva.cap} monthKey={month} />
          <WorkoutCard today={todaySession} weekDays={gymWeek} />
        </div>
      </main>
    </>
  );
}
