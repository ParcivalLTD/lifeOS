"use client";

import { HabitsPanel } from "@/components/habits-panel";
import type { HabitsData } from "@/lib/tab-data";

export function HabitsView({ data }: { data: HabitsData }) {
  return (
    <main className="mx-auto w-full max-w-[720px] p-4">
      <HabitsPanel initialHabits={data.habits} adherence7={data.adherence7} />
    </main>
  );
}
