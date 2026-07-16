import type { Metadata } from "next";
import Link from "next/link";
import {
  generateBillAction,
  saveAccountAction,
  saveBillAction,
  saveSavingsAction,
  upsertBudgetAction,
} from "@/app/finance/actions";
import { AppHeader } from "@/components/app-header";
import { SubmitButton } from "@/components/submit-button";
import { BudgetExpenses } from "@/components/finance/budget-expenses";
import { NetWorthChart } from "@/components/finance/net-worth-chart";
import { Panel } from "@/components/panel";
import { requireUser } from "@/lib/auth";
import {
  computeBudgetVsActual,
  currentNetWorth,
  listAccounts,
  listBills,
  listBudgets,
  listExpenses,
  listSavings,
  netWorthSeries,
} from "@/lib/data/finance";
import { savingsFundsGoals } from "@/lib/data/goals";
import { parseISODate, todayISO } from "@/lib/dates";
import { clampPct, currentMonthKey, fmtMoney, netWorthDeltaFrom } from "@/lib/finance";
import { recurrenceLabel } from "@/lib/recurrence";

export const metadata: Metadata = { title: "LIFEOS — FINANCE" };

const inputCls = "border border-border-input bg-subtle px-2.5 py-2 text-[12.5px]";
const numCls = "w-[92px] border border-border-input bg-subtle px-2 py-2 text-right font-mono text-[12px]";
const addBtn = "cursor-pointer border-0 bg-ink px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#ffffff]";
const savingsFill = "oklch(0.55 0.10 150)";

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const dueLabel = (iso: string) => {
  const d = parseISODate(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};

export default async function FinancePage() {
  const user = await requireUser();
  const month = currentMonthKey();

  // one parallel gather; budget-vs-actual and the net-worth delta derive
  // purely from what's already fetched — no duplicate or serial queries
  const [accounts, savings, expenses, budgets, series, nw, bills, fundsGoals] =
    await Promise.all([
      listAccounts(user.id),
      listSavings(user.id),
      listExpenses(user.id, { monthKey: month }),
      listBudgets(user.id),
      netWorthSeries(user.id, 7),
      currentNetWorth(user.id),
      listBills(user.id),
      savingsFundsGoals(user.id),
    ]);
  const bva = computeBudgetVsActual(budgets, expenses);
  const delta = netWorthDeltaFrom(series, nw);

  const categories = [...new Set([...bva.rows.map((b) => b.category), "Groceries", "Eating out", "Transport", "Subscriptions", "Other"])];

  return (
    <>
      <AppHeader active="finance" />
      <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 p-4">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-start gap-3">
          {/* net worth */}
          <Panel label="Net worth">
            <div className="p-3">
              <div className="font-mono text-[26px] font-semibold">{fmtMoney(nw)}</div>
              <div className="mt-0.5 font-mono text-[11px]" style={{ color: delta >= 0 ? "oklch(0.5 0.1 150)" : "oklch(0.55 0.13 20)" }}>
                {fmtMoney(delta, { sign: true })} THIS MONTH
              </div>
              <div className="mt-3">
                <NetWorthChart points={series} />
              </div>
            </div>
          </Panel>

          {/* accounts */}
          <Panel
            label="Accounts"
            value={`${accounts.length}`}
            footer={
              <form action={saveAccountAction} className="flex flex-wrap gap-1.5 border-t border-border-header p-3">
                <input name="name" required placeholder="Account name" aria-label="Account name" autoComplete="off" className={`${inputCls} min-w-0 flex-[2_1_120px]`} />
                <input name="balance" required inputMode="decimal" placeholder="0.00" aria-label="Balance" className={numCls} />
                <SubmitButton className={`${addBtn} disabled:opacity-50`}>Add</SubmitButton>
              </form>
            }
          >
            {accounts.length === 0 && (
              <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">No accounts yet</p>
            )}
            {accounts.map((a) => (
              <Link key={a.id} href={`/finance/accounts/${a.id}`} className="flex items-baseline justify-between border-b border-border-row px-3 py-2 no-underline">
                <span className="text-[12.5px]">{a.name}</span>
                <span className="font-mono text-[12px] font-semibold">{fmtMoney(a.balance, { cents: true })}</span>
              </Link>
            ))}
          </Panel>

          {/* savings goals */}
          <Panel
            label="Savings goals"
            value={`${savings.length}`}
            footer={
              <form action={saveSavingsAction} className="flex flex-wrap gap-1.5 border-t border-border-header p-3">
                <input name="name" required placeholder="Goal" aria-label="Savings goal name" autoComplete="off" className={`${inputCls} min-w-0 flex-[2_1_110px]`} />
                <input name="current" inputMode="decimal" placeholder="now" aria-label="Current amount" className={`${numCls} w-[70px]`} />
                <input name="target" required inputMode="decimal" placeholder="target" aria-label="Target amount" className={`${numCls} w-[70px]`} />
                <SubmitButton className={`${addBtn} disabled:opacity-50`}>Add</SubmitButton>
              </form>
            }
          >
            {savings.length === 0 && (
              <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">No savings goals yet</p>
            )}
            {savings.map((s) => (
              <Link key={s.id} href={`/finance/savings/${s.id}`} className="block border-b border-border-row px-3 py-2 no-underline">
                <div className="flex items-baseline justify-between">
                  <span className="text-[12.5px] font-medium">{s.name}</span>
                  <span className="font-mono text-[11px] text-muted">{fmtMoney(s.current)} / {fmtMoney(s.target)}</span>
                </div>
                <div className="mt-1.5 h-1 bg-track">
                  <div className="h-1" style={{ width: `${clampPct((s.current / s.target) * 100)}%`, background: savingsFill }} />
                </div>
                {(() => {
                  const funded = fundsGoals.get(s.id);
                  const label = funded ? `FUNDS → ${funded.title}` : s.fundsLabel;
                  return label ? (
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-[.03em] text-faint">{label}</div>
                  ) : null;
                })()}
              </Link>
            ))}
          </Panel>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-3">
          <BudgetExpenses
            monthKey={month}
            budgets={bva.rows}
            expenses={expenses}
            totalCap={bva.cap}
            categories={categories}
          />

          {/* bills / subscriptions register (FR-FIN.4) */}
          <Panel
            label="Bills & subscriptions"
            value={`${bills.length}`}
            footer={
              <form action={saveBillAction} className="flex flex-wrap gap-1.5 border-t border-border-header p-3">
                <input name="name" required placeholder="Bill" aria-label="Bill name" autoComplete="off" className={`${inputCls} min-w-0 flex-[2_1_100px]`} />
                <input name="amount" required inputMode="decimal" placeholder="0.00" aria-label="Amount" className={`${numCls} w-[74px]`} />
                <input type="date" name="nextDue" defaultValue={todayISO()} aria-label="Next due" className={`${inputCls} font-mono`} />
                <select name="repeat" defaultValue="monthly" aria-label="Cadence" className="border border-border-input bg-subtle px-1.5 py-2 text-[12px]">
                  <option value="weekly">WEEKLY</option>
                  <option value="monthly">MONTHLY</option>
                  <option value="yearly">YEARLY</option>
                </select>
                <SubmitButton className={`${addBtn} disabled:opacity-50`}>Add</SubmitButton>
              </form>
            }
          >
            {bills.length === 0 && (
              <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">No recurring bills yet</p>
            )}
            {bills.map((b) => (
              <div key={b.id} className="flex items-baseline gap-2.5 border-b border-border-row px-3 py-2">
                <Link href={`/finance/bills/${b.id}`} className="min-w-0 flex-1 no-underline">
                  <div className="text-[12.5px]">{b.name}</div>
                  <div className="font-mono text-[10px] uppercase tracking-[.03em] text-faint">
                    {recurrenceLabel(b.recurrence)} · NEXT {dueLabel(b.nextDue)}
                  </div>
                </Link>
                <span className="font-mono text-[12px] font-semibold">{fmtMoney(b.amount, { cents: true })}</span>
                <form action={generateBillAction}>
                  <input type="hidden" name="id" value={b.id} />
                  <SubmitButton className="cursor-pointer border border-border-input bg-subtle px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[.06em] disabled:opacity-50">
                    Log
                  </SubmitButton>
                </form>
              </div>
            ))}
          </Panel>

          {/* set / adjust a budget cap */}
          <Panel label="Set budget">
            <form action={upsertBudgetAction} className="flex flex-wrap gap-1.5 p-3">
              <select name="category" aria-label="Budget category" className="min-w-0 flex-1 border border-border-input bg-subtle px-1.5 py-2 text-[12px]">
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <input name="cap" required inputMode="decimal" placeholder="cap" aria-label="Monthly cap" className={numCls} />
              <SubmitButton className={`${addBtn} disabled:opacity-50`}>Set</SubmitButton>
            </form>
            <p className="px-3 pb-3 font-mono text-[9px] uppercase tracking-[.06em] text-faintest">
              Setting a category updates its monthly cap in budget-vs-actual.
            </p>
          </Panel>
        </div>
      </main>
    </>
  );
}
