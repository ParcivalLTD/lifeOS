import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { TabsApp } from "@/components/tabs/tabs-app";
import { requireUser } from "@/lib/auth";
import { buildInitialTrio } from "@/lib/data/tab-data-server";

export const metadata: Metadata = { title: "HELM — GYM" };

export default async function GymPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; lift?: string }>;
}) {
  const user = await requireUser();
  const { session, lift } = await searchParams;
  return (
    <>
      <AppHeader />
      <TabsApp
        initialTab="gym"
        initialData={await buildInitialTrio(user.id, "gym", { session, lift })}
      />
    </>
  );
}
