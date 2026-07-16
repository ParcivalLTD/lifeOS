import Link from "next/link";
import { GoalProgressRow } from "@/components/goals/goal-progress-row";
import { Panel } from "@/components/panel";
import type { GoalListItem } from "@/lib/data/goals";

/** Active goals surfaced on the Today dashboard (FR-DASH.1 / FR-GOAL.2). */
export function GoalsCard({ goals, activeCount }: { goals: GoalListItem[]; activeCount: number }) {
  return (
    <Panel
      label="Goals"
      value={`${activeCount} active`}
      footer={
        <Link
          href="/goals"
          className="block border-t border-border-header bg-subtle px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] no-underline"
        >
          All goals →
        </Link>
      }
    >
      {goals.length === 0 && (
        <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
          No active goals — set your direction on the Goals tab
        </p>
      )}
      {goals.map((goal) => (
        <GoalProgressRow key={goal.id} goal={goal} />
      ))}
    </Panel>
  );
}
