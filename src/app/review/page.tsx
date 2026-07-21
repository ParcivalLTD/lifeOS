import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { TabsApp } from "@/components/tabs/tabs-app";
import { requireUser } from "@/lib/auth";
import { buildInitialTrio } from "@/lib/data/tab-data-server";

export const metadata: Metadata = { title: "HELM — REVIEW" };

/** The Assistant tab's Reviews segment (FR-REV.3). Off the swipe track — it
 * shares the tab with the chat, which owns its own resumable URLs. */
export default async function ReviewPage() {
  const user = await requireUser();
  return (
    <>
      <AppHeader />
      <TabsApp initialView="review" initialData={await buildInitialTrio(user.id, "review")} />
    </>
  );
}
