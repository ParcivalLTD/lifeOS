"use client";

import { BudgetCard } from "@/components/dashboard/budget-card";
import { GoalsCard } from "@/components/dashboard/goals-card";
import { HabitsCard } from "@/components/dashboard/habits-card";
import { NudgeBanner } from "@/components/dashboard/nudge-banner";
import { SchedulePanel } from "@/components/dashboard/schedule-panel";
import { TasksCard } from "@/components/dashboard/tasks-card";
import { WorkoutCard } from "@/components/dashboard/workout-card";
import type { TodayData } from "@/lib/tab-data";

export function TodayView({ data }: { data: TodayData }) {
  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 p-4">
      <NudgeBanner />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-3">
        <SchedulePanel events={data.events} nowHM={data.nowHM} />
        <TasksCard tasks={data.topTasks} openCount={data.openCount} today={data.todayISO} />
        <HabitsCard habits={data.habits} adherence7={data.adherence7} />
        <GoalsCard goals={data.goals} activeCount={data.activeGoalCount} />
        <BudgetCard rows={data.budgetRows} spent={data.budgetSpent} cap={data.budgetCap} monthKey={data.monthKey} />
        <WorkoutCard today={data.gymSession} weekDays={data.gymWeek} />
      </div>
    </main>
  );
}
