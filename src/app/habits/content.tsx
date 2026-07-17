import { HabitsPanel } from "@/components/habits-panel";
import { listHabitsWithStats } from "@/lib/data/habits";
import { todayISO } from "@/lib/dates";

export async function HabitsContent({ userId }: { userId: string; email?: string }) {
  const overview = await listHabitsWithStats(userId, todayISO());

  return (
      <main className="mx-auto w-full max-w-[720px] p-4">
        <HabitsPanel
          initialHabits={overview.habits}
          adherence7={overview.adherence7}
        />
      </main>
  );
}
