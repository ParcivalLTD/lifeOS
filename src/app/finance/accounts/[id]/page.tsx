import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveAccountAction, saveAccountAction } from "@/app/finance/actions";
import { AppHeader } from "@/components/app-header";
import { ConfirmButton } from "@/components/confirm-button";
import { Panel } from "@/components/panel";
import { requireUser } from "@/lib/auth";
import { getAccount } from "@/lib/data/finance";

export const metadata: Metadata = { title: "LIFEOS — ACCOUNT" };

const inputCls = "border border-border-input bg-subtle px-2.5 py-2 text-[12.5px]";
const labelCls = "font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faint";

export default async function EditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const account = await getAccount(user.id, id);
  if (!account) notFound();

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-[480px] p-4">
        <Panel label="Account — edit">
          <form action={saveAccountAction} className="flex flex-col gap-3 p-4">
            <input type="hidden" name="id" value={account.id} />
            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Name</span>
              <input name="name" required defaultValue={account.name} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Balance</span>
              <input name="balance" required inputMode="decimal" defaultValue={String(account.balance)} className={`${inputCls} font-mono`} />
            </label>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="submit" className="cursor-pointer border-0 bg-ink px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#ffffff]">Save</button>
              <ConfirmButton label="Delete" confirmLabel="Confirm delete?" formAction={archiveAccountAction} />
              <Link href="/finance" className="px-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">Cancel</Link>
            </div>
            <p className="font-mono text-[9px] uppercase tracking-[.06em] text-faintest">Updating a balance recomputes net worth.</p>
          </form>
        </Panel>
      </main>
    </>
  );
}
