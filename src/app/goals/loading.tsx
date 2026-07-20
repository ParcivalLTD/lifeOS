import { AppHeader } from "@/components/app-header";
import { GoalsSkeleton } from "@/components/tab-skeletons";

/** Goals is a real navigation now that it's off the swipe track, so it gets
 * a tap-nav skeleton like the other detail routes. */
export default function GoalsLoading() {
  return (
    <>
      <AppHeader />
      <GoalsSkeleton />
    </>
  );
}
