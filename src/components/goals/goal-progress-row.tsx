import Link from "next/link";
import { DOMAIN_DOT_CLASS } from "@/lib/domains";
import type { GoalListItem } from "@/lib/data/goals";

/** Goal row with a domain-coloured progress bar (Goals page + dashboard). */
export function GoalProgressRow({ goal }: { goal: GoalListItem }) {
  return (
    <Link
      href={`/goals/${goal.id}`}
      className="grid grid-cols-[1fr_120px] items-center gap-3 border-b border-border-row px-3 py-2 no-underline sm:grid-cols-[1fr_200px]"
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <span className={`mt-1 h-[7px] w-[7px] flex-none self-start ${DOMAIN_DOT_CLASS[goal.domain]}`} />
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium">{goal.title}</div>
          <div className="truncate font-mono text-[10px] uppercase tracking-[.03em] text-faint">{goal.sub}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1 flex-1 bg-track">
          <div className={`h-1 ${DOMAIN_DOT_CLASS[goal.domain]}`} style={{ width: `${goal.pct}%` }} />
        </div>
        <span className="w-[34px] flex-none text-right font-mono text-[11px] text-muted">{goal.pct}%</span>
      </div>
    </Link>
  );
}
