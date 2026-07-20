import { AppHeader } from "@/components/app-header";
import { SkeletonPanel } from "@/components/skeleton";

/** Goal-detail skeleton (detail routes keep tap-nav skeletons; track tabs
 * don't — the co-mounted TabsApp swap must stay seamless). */
export default function GoalDetailLoading() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-[1280px] columns-[320px] gap-3 [&>*]:mb-3 [&>*]:break-inside-avoid [&>*]:inline-block [&>*]:w-full p-4">
      <SkeletonPanel label="Goal" rows={3} />
      <SkeletonPanel label="Milestones" rows={3} />
      <SkeletonPanel label="Recurring actions" rows={2} />
      <SkeletonPanel label="Linked metrics" rows={2} />
      </main>
    </>
  );
}
