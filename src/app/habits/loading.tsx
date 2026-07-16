import { AppHeader } from "@/components/app-header";
import { SkeletonPanel } from "@/components/skeleton";

export default function HabitsLoading() {
  return (
    <>
      <AppHeader active="habits" />
      <main className="mx-auto w-full max-w-[720px] p-4">
        <SkeletonPanel label="Habits" rows={6} />
      </main>
    </>
  );
}
