import Link from "next/link";
import { Panel } from "@/components/panel";
import {
  budgetFillPct,
  BUDGET_STATUS_COLOR,
  budgetStatus,
  fmtMoney,
  monthLabelOf,
} from "@/lib/finance";
import type { BudgetActual } from "@/lib/data/finance";

/** Live budget-vs-actual summary on the dashboard (Finance now shipped). */
export function BudgetCard({
  rows,
  spent,
  cap,
  monthKey,
}: {
  rows: BudgetActual[];
  spent: number;
  cap: number;
  monthKey: string;
}) {
  const top = rows
    .slice()
    .sort((a, b) => budgetFillPct(b.spent, b.cap) - budgetFillPct(a.spent, a.cap))
    .slice(0, 3);

  return (
    <Panel
      label={`Budget — ${monthLabelOf(`${monthKey}-01`)}`}
      value={`${fmtMoney(spent)} / ${fmtMoney(cap)}`}
      footer={
        <Link
          href="/finance"
          className="block border-t border-border-header bg-subtle px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] no-underline"
        >
          Finance →
        </Link>
      }
    >
      {top.length === 0 && (
        <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">No budgets set</p>
      )}
      {top.map((b) => (
        <div key={b.id} className="border-b border-border-row px-3 py-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px]">{b.category}</span>
            <span className="font-mono text-[11px] text-muted">{fmtMoney(b.spent)} / {fmtMoney(b.cap)}</span>
          </div>
          <div className="mt-1.5 h-1 bg-track">
            <div className="h-1" style={{ width: `${budgetFillPct(b.spent, b.cap)}%`, background: BUDGET_STATUS_COLOR[budgetStatus(b.spent, b.cap)] }} />
          </div>
        </div>
      ))}
    </Panel>
  );
}
