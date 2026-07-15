import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { HabitsPanel } from "@/components/habits-panel";
import { requireUser } from "@/lib/auth";
import { listHabitsWithStats } from "@/lib/data/habits";
import { todayISO } from "@/lib/dates";

export const metadata: Metadata = { title: "LIFEOS — HABITS" };

export default async function HabitsPage() {
  const user = await requireUser();
  const overview = await listHabitsWithStats(user.id, todayISO());

  return (
    <>
      <AppHeader active="habits" />
      <main className="mx-auto w-full max-w-[720px] p-4">
        <HabitsPanel
          initialHabits={overview.habits}
          adherence7={overview.adherence7}
        />
      </main>
    </>
  );
}
