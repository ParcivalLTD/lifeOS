import type { Metadata } from "next";
import { CalendarContent } from "@/app/calendar/content";
import { AppHeader } from "@/components/app-header";
import { TabShell } from "@/components/tab-shell";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "LIFEOS — CALENDAR" };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const user = await requireUser();
  const { view, date } = await searchParams;
  return (
    <>
      <AppHeader active="calendar" />
      <TabShell active="calendar" userId={user.id} email={user.email ?? ""}>
        <CalendarContent userId={user.id} view={view} date={date} />
      </TabShell>
    </>
  );
}
