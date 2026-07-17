import type { Metadata } from "next";
import { FinanceContent } from "@/app/finance/content";
import { AppHeader } from "@/components/app-header";
import { TabShell } from "@/components/tab-shell";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "LIFEOS — FINANCE" };

export default async function FinancePage() {
  const user = await requireUser();
  return (
    <>
      <AppHeader active="finance" />
      <TabShell active="finance" userId={user.id} email={user.email ?? ""}>
        <FinanceContent userId={user.id} />
      </TabShell>
    </>
  );
}
