import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { TabsApp } from "@/components/tabs/tabs-app";
import { requireUser } from "@/lib/auth";
import { buildInitialTrio } from "@/lib/data/tab-data-server";

export const metadata: Metadata = { title: "HELM — CALENDAR" };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const user = await requireUser();
  const { view, date } = await searchParams;
  return (
    <>
      <AppHeader />
      <TabsApp
        initialTab="calendar"
        initialData={await buildInitialTrio(user.id, "calendar", { view, date })}
      />
    </>
  );
}
