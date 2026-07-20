import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { GoalsView } from "@/components/tabs/views/goals-view";
import { requireUser } from "@/lib/auth";
import { buildGoalsData } from "@/lib/data/tab-data-server";

export const metadata: Metadata = { title: "HELM — GOALS" };

/**
 * Goals left the primary nav but stayed a first-class route: the dashboard's
 * Goals card ("All goals →"), goal detail pages and every module's goal rows
 * link straight here. Off the swipe track now, so it renders standalone
 * rather than through the co-mounted shell.
 */
export default async function GoalsPage() {
  const user = await requireUser();
  return (
    <>
      <AppHeader />
      <GoalsView data={await buildGoalsData(user.id)} />
    </>
  );
}
