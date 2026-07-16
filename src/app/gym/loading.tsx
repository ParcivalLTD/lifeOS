import { AppHeader } from "@/components/app-header";
import { Panel } from "@/components/panel";
import { SkeletonChart, SkeletonPanel } from "@/components/skeleton";

export default function GymLoading() {
  return (
    <>
      <AppHeader active="gym" />
      <main className="mx-auto grid w-full max-w-[1280px] grid-cols-[repeat(auto-fit,minmax(330px,1fr))] items-start gap-3 p-4">
        <SkeletonPanel label="Session" rows={6} />
        <div className="flex flex-col gap-3">
          <SkeletonPanel label="Estimated 1RM — PRs" rows={4} />
          <Panel label="e1RM — last 8 weeks">
            <SkeletonChart />
          </Panel>
          <SkeletonPanel label="Adherence — this week" rows={1} />
          <SkeletonPanel label="Templates" rows={2} />
        </div>
      </main>
    </>
  );
}
