"use client";

import { useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { logExpenseAction } from "@/app/finance/actions";
import { DisclosurePanel } from "@/components/disclosure-panel";
import { Panel } from "@/components/panel";
import { toISODate } from "@/lib/dates";
import {
  budgetFillPct,
  BUDGET_STATUS_COLOR,
  budgetStatus,
  fmtMoney,
  monthLabelOf,
} from "@/lib/finance";
import type { BudgetActual, Expense } from "@/lib/data/finance";

type OptExpense = Expense & { optimistic?: boolean };

/**
 * Budget-vs-actual + expense log + the fastest capture flow in the app
 * (FR-FIN.2): type an amount, pick a category, LOG — the expense appears and
 * its budget bar advances instantly (optimistic), before the server responds.
 */
export function BudgetExpenses({
  monthKey,
  budgets: initialBudgets,
  expenses: initialExpenses,
  totalCap,
  categories,
}: {
  monthKey: string;
  budgets: BudgetActual[];
  expenses: Expense[];
  totalCap: number;
  categories: string[];
}) {
  const [, startTransition] = useTransition();
  const monthLabel = monthLabelOf(`${monthKey}-01`);

  const [expenses, addExpense] = useOptimistic(
    initialExpenses as OptExpense[],
    (state: OptExpense[], e: OptExpense) => [e, ...state],
  );

  // spent per category derives from the (optimistic) expense list so a new log
  // moves both the log and the matching budget bar together.
  const spentByCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of expenses) m.set(e.category, Math.round(((m.get(e.category) ?? 0) + e.amount) * 100) / 100);
    return m;
  }, [expenses]);

  const rows = initialBudgets.map((b) => ({ ...b, spent: spentByCat.get(b.category) ?? 0 }));
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);

  const amountRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(categories[0] ?? "Other");

  const submit = () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    startTransition(async () => {
      addExpense({
        id: `optimistic-${Date.now()}`,
        dateISO: toISODate(new Date()),
        description: category,
        amount: Math.round(value * 100) / 100,
        category,
        optimistic: true,
      });
      setAmount("");
      amountRef.current?.focus();
      await logExpenseAction({ amount: value, category });
    });
  };

  return (
    <>
      <DisclosurePanel
        label={`Budget vs actual — ${monthLabel}`}
        value={`${fmtMoney(totalSpent)} / ${fmtMoney(totalCap)}`}
        addLabel="Log expense"
        /* stays open after each log — rapid ≤10s capture keeps focus on amount */
        form={() => (
          <div className="flex gap-1.5 border-t border-border-header p-3">
            <input
              ref={amountRef}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="0.00"
              inputMode="decimal"
              aria-label="Expense amount"
              className="w-[84px] border border-border-input bg-subtle px-2 py-1.5 font-mono text-[12px]"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Expense category"
              className="min-w-0 flex-1 border border-border-input bg-subtle px-1.5 py-1.5 text-[12px]"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={submit}
              className="cursor-pointer border-0 bg-ink px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#ffffff]"
            >
              Log
            </button>
          </div>
        )}
      >
        {rows.length === 0 && (
          <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
            No budgets yet — set caps under Set budget
          </p>
        )}
        {rows.map((b) => {
          const color = BUDGET_STATUS_COLOR[budgetStatus(b.spent, b.cap)];
          return (
            <div key={b.id} className="border-b border-border-row px-3 py-1.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[12px]">{b.category}</span>
                <span className="font-mono text-[11px] text-muted">
                  {fmtMoney(b.spent)} / {fmtMoney(b.cap)}
                </span>
              </div>
              <div className="mt-1.5 h-1 bg-track">
                <div className="h-1" style={{ width: `${budgetFillPct(b.spent, b.cap)}%`, background: color }} />
              </div>
            </div>
          );
        })}
      </DisclosurePanel>

      <Panel label="Expense log" value="CAPTURE TARGET ≤10 S">
        {expenses.length === 0 && (
          <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
            No expenses logged this month
          </p>
        )}
        {expenses.slice(0, 12).map((x) => (
          <div key={x.id} className={`flex items-baseline gap-2.5 border-b border-border-row px-3 py-2 ${x.optimistic ? "opacity-60" : ""}`}>
            <span className="w-[46px] flex-none font-mono text-[10px] uppercase text-faint">
              {x.dateISO.slice(5).replace("-", "/")}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12.5px]">{x.description}</span>
            <span className="font-mono text-[10px] uppercase text-faint">{x.category}</span>
            <span className="w-[66px] text-right font-mono text-[12px] font-semibold">
              {fmtMoney(x.amount, { cents: true })}
            </span>
          </div>
        ))}
      </Panel>
    </>
  );
}
