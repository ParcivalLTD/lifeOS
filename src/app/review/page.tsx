import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { ASSISTANT_SEGMENTS, Segmented } from "@/components/segmented";
import { ReviewViewTab } from "@/components/tabs/views/review-view";
import { requireUser } from "@/lib/auth";
import { buildReviewData } from "@/lib/data/tab-data-server";

export const metadata: Metadata = { title: "HELM — REVIEW" };

/** The Assistant tab's Reviews segment (FR-REV.3). Off the swipe track — it
 * shares the tab with the chat, which owns its own resumable URLs. */
export default async function ReviewPage() {
  const user = await requireUser();
  return (
    <>
      <AppHeader />
      <Segmented segments={ASSISTANT_SEGMENTS} active="reviews" />
      <ReviewViewTab data={await buildReviewData(user.id)} />
    </>
  );
}
