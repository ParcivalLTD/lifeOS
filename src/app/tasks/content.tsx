import { TasksPanel } from "@/components/tasks-panel";
import { listTasks } from "@/lib/data/tasks";
import { todayISO } from "@/lib/dates";

export async function TasksContent({ userId }: { userId: string; email?: string }) {
  const tasks = await listTasks(userId);

  return (
      <main className="mx-auto w-full max-w-[720px] p-4">
        <TasksPanel initialTasks={tasks} today={todayISO()} />
      </main>
  );
}
