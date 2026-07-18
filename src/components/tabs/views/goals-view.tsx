"use client";

import Link from "next/link";
import { GoalProgressRow } from "@/components/goals/goal-progress-row";
import { Panel } from "@/components/panel";
import type { GoalsData } from "@/lib/tab-data";

export function GoalsView({ data }: { data: GoalsData }) {
  const total = data.groups.reduce((n, g) => n + g.goals.length, 0);
  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faint">
          Goals — all domains, by horizon
        </span>
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[11px] text-muted">{total} active</span>
          <Link href="/goals/new" className="font-mono text-[10px] font-semibold uppercase tracking-[.06em]">
            New goal →
          </Link>
        </div>
      </div>

      {data.groups.length === 0 && (
        <Panel label="Goals">
          <p className="px-3 py-3 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
            No active goals — <Link href="/goals/new">create your first</Link>.
          </p>
        </Panel>
      )}

      {data.groups.map((group) => (
        <Panel key={group.horizon} label={group.label} value={`${group.goals.length} GOALS`}>
          {group.goals.map((goal) => (
            <GoalProgressRow key={goal.id} goal={goal} />
          ))}
        </Panel>
      ))}
    </main>
  );
}
