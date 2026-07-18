import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveBillAction, saveBillAction } from "@/app/finance/actions";
import { AppHeader } from "@/components/app-header";
import { ConfirmButton } from "@/components/confirm-button";
import { Panel } from "@/components/panel";
import { requireUser } from "@/lib/auth";
import { getBill } from "@/lib/data/finance";
import { parseRRule } from "@/lib/recurrence";

export const metadata: Metadata = { title: "LIFEOS — BILL" };

const inputCls = "border border-border-input bg-subtle px-2.5 py-2 text-[12.5px]";
const labelCls = "font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faint";

const CATEGORIES = ["Groceries", "Eating out", "Transport", "Subscriptions", "Other"];

export default async function EditBillPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const bill = await getBill(user.id, id);
  if (!bill) notFound();

  const freq = parseRRule(bill.recurrence)?.freq ?? "MONTHLY";
  const repeat = freq.toLowerCase();

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-[480px] p-4">
        <Panel label="Bill — edit">
          <form action={saveBillAction} className="flex flex-col gap-3 p-4">
            <input type="hidden" name="id" value={bill.id} />
            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Name</span>
              <input name="name" required defaultValue={bill.name} className={inputCls} />
            </label>
            <div className="flex flex-wrap gap-1.5">
              <label className="flex flex-1 flex-col gap-1.5">
                <span className={labelCls}>Amount</span>
                <input name="amount" required inputMode="decimal" defaultValue={String(bill.amount)} className={`${inputCls} font-mono`} />
              </label>
              <label className="flex flex-1 flex-col gap-1.5">
                <span className={labelCls}>Category</span>
                <select name="category" defaultValue={bill.category} className={inputCls}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <label className="flex flex-col gap-1.5">
                <span className={labelCls}>Next due</span>
                <input type="date" name="nextDue" defaultValue={bill.nextDue} className={`${inputCls} font-mono`} />
              </label>
              <label className="flex flex-1 flex-col gap-1.5">
                <span className={labelCls}>Cadence</span>
                <select name="repeat" defaultValue={repeat} className={inputCls}>
                  <option value="weekly">WEEKLY</option>
                  <option value="monthly">MONTHLY</option>
                  <option value="yearly">YEARLY</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="submit" className="cursor-pointer border-0 bg-ink px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#ffffff]">Save</button>
              <ConfirmButton label="Delete" confirmLabel="Confirm delete?" formAction={archiveBillAction} />
              <Link href="/finance" className="px-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">Cancel</Link>
            </div>
            <p className="font-mono text-[9px] uppercase tracking-[.06em] text-faintest">Use LOG on the register to post the next occurrence to the calendar.</p>
          </form>
        </Panel>
      </main>
    </>
  );
}
