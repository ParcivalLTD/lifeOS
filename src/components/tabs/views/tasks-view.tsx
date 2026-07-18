"use client";

import { TasksPanel } from "@/components/tasks-panel";
import type { TasksData } from "@/lib/tab-data";

export function TasksView({ data }: { data: TasksData }) {
  return (
    <main className="mx-auto w-full max-w-[720px] p-4">
      <TasksPanel initialTasks={data.tasks} today={data.todayISO} />
    </main>
  );
}
