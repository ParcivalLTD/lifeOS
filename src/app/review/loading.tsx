import { AppHeader } from "@/components/app-header";
import { ASSISTANT_SEGMENTS, Segmented } from "@/components/segmented";
import { ReviewSkeleton } from "@/components/tab-skeletons";

/** Reviews is a real navigation (the Assistant tab's other segment), so the
 * segmented control paints immediately and only the body waits. */
export default function ReviewLoading() {
  return (
    <>
      <AppHeader />
      <Segmented segments={ASSISTANT_SEGMENTS} active="reviews" />
      <ReviewSkeleton />
    </>
  );
}
