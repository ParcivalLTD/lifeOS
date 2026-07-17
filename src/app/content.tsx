import { BudgetCard } from "@/components/dashboard/budget-card";
import { GoalsCard } from "@/components/dashboard/goals-card";
import { HabitsCard } from "@/components/dashboard/habits-card";
import { NudgeBanner } from "@/components/dashboard/nudge-banner";
import { SchedulePanel } from "@/components/dashboard/schedule-panel";
import { TasksCard } from "@/components/dashboard/tasks-card";
import { WorkoutCard } from "@/components/dashboard/workout-card";
import { listEventsInRange } from "@/lib/data/events";
import { budgetVsActual } from "@/lib/data/finance";
import { topActiveGoals } from "@/lib/data/goals";
import { listSessions, thisWeekDays } from "@/lib/data/gym";
import { listHabitsWithStats } from "@/lib/data/habits";
import { listTasks } from "@/lib/data/tasks";
import { addDaysISO, todayISO } from "@/lib/dates";
import { currentMonthKey } from "@/lib/finance";

export async function TodayContent({ userId }: { userId: string; email?: string }) {
  const today = todayISO();
  const month = currentMonthKey();

  // one parallel round trip — the dashboard is the product (FR-DASH.3)
  const [tasks, habitsOverview, todaysEvents, goalsTop, bva, sessions, gymWeek] =
    await Promise.all([
      listTasks(userId),
      listHabitsWithStats(userId, today),
      listEventsInRange(userId, today, addDaysISO(today, 1)),
      topActiveGoals(userId, 4),
      budgetVsActual(userId, month),
      listSessions(userId, 5),
      thisWeekDays(userId),
    ]);

  const openTasks = tasks.filter((t) => t.status === "open");
  const scheduledHabits = habitsOverview.habits.filter((h) => h.scheduledToday);
  const todaySession = sessions.find((s) => s.dateISO === today) ?? null;
  const now = new Date();
  const nowHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  return (
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
  );
}
