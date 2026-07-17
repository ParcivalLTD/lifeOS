import type { Metadata } from "next";
import { TasksContent } from "@/app/tasks/content";
import { AppHeader } from "@/components/app-header";
import { TabShell } from "@/components/tab-shell";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "LIFEOS — TASKS" };

export default async function TasksPage() {
  const user = await requireUser();
  return (
    <>
      <AppHeader active="tasks" />
      <TabShell active="tasks" userId={user.id} email={user.email ?? ""}>
        <TasksContent userId={user.id} />
      </TabShell>
    </>
  );
}
