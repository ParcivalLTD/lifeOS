import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { TasksPanel } from "@/components/tasks-panel";
import { requireUser } from "@/lib/auth";
import { listTasks } from "@/lib/data/tasks";
import { todayISO } from "@/lib/dates";

export const metadata: Metadata = { title: "LIFEOS — TASKS" };

export default async function TasksPage() {
  const user = await requireUser();
  const tasks = await listTasks(user.id);

  return (
    <>
      <AppHeader active="tasks" />
      <main className="mx-auto w-full max-w-[720px] p-4">
        <TasksPanel initialTasks={tasks} today={todayISO()} />
      </main>
    </>
  );
}
