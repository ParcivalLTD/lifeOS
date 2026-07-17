import type { Metadata } from "next";
import { HabitsContent } from "@/app/habits/content";
import { AppHeader } from "@/components/app-header";
import { TabShell } from "@/components/tab-shell";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "LIFEOS — HABITS" };

export default async function HabitsPage() {
  const user = await requireUser();
  return (
    <>
      <AppHeader active="habits" />
      <TabShell active="habits" userId={user.id} email={user.email ?? ""}>
        <HabitsContent userId={user.id} />
      </TabShell>
    </>
  );
}
