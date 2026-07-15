"use client";

import { useMemo, useOptimistic, useTransition } from "react";
import { toggleHabitAction } from "@/app/habits/actions";
import { CheckButton } from "@/components/check-button";
import { Panel } from "@/components/panel";
import { toISODate } from "@/lib/dates";
import type { HabitItem } from "@/lib/data/habits";

/** Today's habit checklist (FR-DASH.1), tickable inline (FR-DASH.2). */
export function HabitsCard({
  habits: initialHabits,
  adherence7,
}: {
  habits: HabitItem[];
  adherence7: number;
}) {
  const [, startTransition] = useTransition();
  const [habits, patch] = useOptimistic(
    initialHabits,
    (state: HabitItem[], p: { id: string; done: boolean }) =>
      state.map((h) =>
        h.id === p.id
          ? {
              ...h,
              doneToday: p.done,
              streak: Math.max(0, h.streak + (p.done ? 1 : -1)),
            }
          : h,
      ),
  );

  const doneCount = useMemo(
    () => habits.filter((h) => h.doneToday).length,
    [habits],
  );

  const toggle = (h: HabitItem) => {
    const done = !h.doneToday;
    startTransition(async () => {
      patch({ id: h.id, done });
      await toggleHabitAction(h.id, toISODate(new Date()), done);
    });
  };

  return (
    <Panel
      label="Habits"
      value={`${doneCount} / ${habits.length}`}
      footer={
        <div className="border-t border-border-row px-3 py-2 font-mono text-[10px] tracking-[.06em] text-faint">
          7-DAY ADHERENCE {adherence7}%
        </div>
      }
    >
      {habits.length === 0 && (
        <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
          Nothing scheduled today
        </p>
      )}
      {habits.map((h) => (
        <div
          key={h.id}
          className="flex items-baseline gap-2.5 border-b border-border-row px-3 py-2"
        >
          <CheckButton
            checked={h.doneToday}
            label={h.doneToday ? `Untick "${h.title}"` : `Tick "${h.title}"`}
            onToggle={() => toggle(h)}
          />
          <span
            className={`min-w-0 flex-1 truncate text-[12.5px] ${
              h.doneToday ? "opacity-50" : ""
            }`}
          >
            {h.title}
          </span>
          <span className="flex-none font-mono text-[11px] text-muted">
            ×{h.streak}
          </span>
        </div>
      ))}
    </Panel>
  );
}
