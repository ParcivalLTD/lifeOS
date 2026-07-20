import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { TabsApp } from "@/components/tabs/tabs-app";
import { requireUser } from "@/lib/auth";
import { buildInitialTrio } from "@/lib/data/tab-data-server";

export const metadata: Metadata = { title: "HELM — TODAY" };

export default async function TodayPage() {
  const user = await requireUser();
  return (
    <>
      <AppHeader />
      <TabsApp initialTab="today" initialData={await buildInitialTrio(user.id, "today")} />
    </>
  );
}
