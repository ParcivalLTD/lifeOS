import type { Metadata } from "next";
import { GoalsContent } from "@/app/goals/content";
import { AppHeader } from "@/components/app-header";
import { TabShell } from "@/components/tab-shell";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "LIFEOS — GOALS" };

export default async function GoalsPage() {
  const user = await requireUser();
  return (
    <>
      <AppHeader active="goals" />
      <TabShell active="goals" userId={user.id} email={user.email ?? ""}>
        <GoalsContent userId={user.id} />
      </TabShell>
    </>
  );
}
