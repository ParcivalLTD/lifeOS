import { AppHeader } from "@/components/app-header";
import { Panel } from "@/components/panel";
import { SkeletonChart, SkeletonPanel } from "@/components/skeleton";

export default function FinanceLoading() {
  return (
    <>
      <AppHeader active="finance" />
      <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 p-4">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-start gap-3">
          <Panel label="Net worth">
            <SkeletonChart />
          </Panel>
          <SkeletonPanel label="Accounts" rows={4} />
          <SkeletonPanel label="Savings goals" rows={2} />
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-3">
          <SkeletonPanel label="Budget vs actual" rows={5} />
          <SkeletonPanel label="Expense log" rows={6} />
          <SkeletonPanel label="Bills & subscriptions" rows={4} />
        </div>
      </main>
    </>
  );
}
