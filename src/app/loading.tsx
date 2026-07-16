import { AppHeader } from "@/components/app-header";
import { SkeletonPanel } from "@/components/skeleton";

/** Today dashboard skeleton — panel chrome appears instantly on navigation. */
export default function TodayLoading() {
  return (
    <>
      <AppHeader active="today" />
      <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 p-4">
        <div className="h-[38px] bg-ink opacity-90" />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-3">
          <SkeletonPanel label="Schedule" rows={5} />
          <SkeletonPanel label="Tasks" rows={3} />
          <SkeletonPanel label="Habits" rows={5} />
          <SkeletonPanel label="Goals" rows={4} />
          <SkeletonPanel label="Budget" rows={3} />
          <SkeletonPanel label="Workout" rows={2} />
        </div>
      </main>
    </>
  );
}
