import { AppHeader } from "@/components/app-header";
import { SkeletonPanel } from "@/components/skeleton";

/** Goal-detail skeleton (detail routes keep tap-nav skeletons; tab routes
 * don't — the TabTrack swap must stay seamless). */
export default function GoalDetailLoading() {
  return (
    <>
      <AppHeader active="goals" />
      <main className="mx-auto grid w-full max-w-[1280px] grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-3 p-4">
      <SkeletonPanel label="Goal" rows={3} />
      <SkeletonPanel label="Milestones" rows={3} />
      <SkeletonPanel label="Recurring actions" rows={2} />
      <SkeletonPanel label="Linked metrics" rows={2} />
      </main>
    </>
  );
}
