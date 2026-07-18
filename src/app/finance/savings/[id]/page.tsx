import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveSavingsAction, saveSavingsAction } from "@/app/finance/actions";
import { AppHeader } from "@/components/app-header";
import { ConfirmButton } from "@/components/confirm-button";
import { Panel } from "@/components/panel";
import { requireUser } from "@/lib/auth";
import { getSavingsGoal } from "@/lib/data/finance";
import { goalOptions, savingsFundsGoals } from "@/lib/data/goals";
import { HORIZON_LABEL } from "@/lib/goals";

export const metadata: Metadata = { title: "LIFEOS — SAVINGS GOAL" };

const inputCls = "border border-border-input bg-subtle px-2.5 py-2 text-[12.5px]";
const labelCls = "font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faint";

export default async function EditSavingsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [goal, options, funded] = await Promise.all([
    getSavingsGoal(user.id, id),
    goalOptions(user.id),
    savingsFundsGoals(user.id),
  ]);
  if (!goal) notFound();
  const linkedGoalId = funded.get(id)?.goalId ?? "";

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-[480px] p-4">
        <Panel label="Savings goal — edit">
          <form action={saveSavingsAction} className="flex flex-col gap-3 p-4">
            <input type="hidden" name="id" value={goal.id} />
            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Name</span>
              <input name="name" required defaultValue={goal.name} className={inputCls} />
            </label>
            <div className="flex flex-wrap gap-1.5">
              <label className="flex flex-1 flex-col gap-1.5">
                <span className={labelCls}>Saved</span>
                <input name="current" inputMode="decimal" defaultValue={String(goal.current)} className={`${inputCls} font-mono`} />
              </label>
              <label className="flex flex-1 flex-col gap-1.5">
                <span className={labelCls}>Target</span>
                <input name="target" required inputMode="decimal" defaultValue={String(goal.target)} className={`${inputCls} font-mono`} />
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Funds → life goal</span>
              <select name="fundsGoalId" defaultValue={linkedGoalId} className={inputCls}>
                <option value="">— none —</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    [{HORIZON_LABEL[o.horizon]}] {o.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="submit" className="cursor-pointer border-0 bg-ink px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#ffffff]">Save</button>
              <ConfirmButton label="Delete" confirmLabel="Confirm delete?" formAction={archiveSavingsAction} />
              <Link href="/finance" className="px-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">Cancel</Link>
            </div>
            <p className="font-mono text-[9px] uppercase tracking-[.06em] text-faintest">Funds→ creates a §7.7 Link from this savings goal to a life goal.</p>
          </form>
        </Panel>
      </main>
    </>
  );
}
