import { AppHeader } from "@/components/app-header";
import { SkeletonPanel } from "@/components/skeleton";

export default function GoalsLoading() {
  return (
    <>
      <AppHeader active="goals" />
      <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 p-4">
        <SkeletonPanel label="Life" rows={3} />
        <SkeletonPanel label="Yearly" rows={4} />
        <SkeletonPanel label="Quarterly" rows={3} />
      </main>
    </>
  );
}
