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
      <NudgeBanner
        today={data.todayISO}
        nudge={data.nudge}
        enabled={data.nudgeEnabled}
        configured={data.nudgeConfigured}
      />
      {/* Ordered for the morning (FR-DASH.1): what's on today, then the three
          things to act on (tasks, habits, workout), then the slower-moving
          roll-ups (goals, budget). Reads top-to-bottom as "today". */}
      <div className="columns-[320px] gap-3 [&>*]:mb-3 [&>*]:break-inside-avoid [&>*]:inline-block [&>*]:w-full">
        <SchedulePanel events={data.events} nowHM={data.nowHM} />
        <TasksCard tasks={data.topTasks} openCount={data.openCount} today={data.todayISO} />
        <HabitsCard habits={data.habits} adherence7={data.adherence7} />
        <WorkoutCard today={data.gymSession} weekDays={data.gymWeek} />
        <GoalsCard goals={data.goals} activeCount={data.activeGoalCount} />
        <BudgetCard rows={data.budgetRows} spent={data.budgetSpent} cap={data.budgetCap} monthKey={data.monthKey} />
      </div>
    </main>
  );
}
