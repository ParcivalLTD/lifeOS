import type { Metadata } from "next";
import { TodayContent } from "@/app/content";
import { AppHeader } from "@/components/app-header";
import { TabShell } from "@/components/tab-shell";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "LIFEOS — TODAY" };

export default async function TodayPage() {
  const user = await requireUser();
  return (
    <>
      <AppHeader active="today" />
      <TabShell active="today" userId={user.id} email={user.email ?? ""}>
        <TodayContent userId={user.id} />
      </TabShell>
    </>
  );
}
