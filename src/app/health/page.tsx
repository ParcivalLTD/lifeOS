import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { TabsApp } from "@/components/tabs/tabs-app";
import { requireUser } from "@/lib/auth";
import { buildInitialTrio } from "@/lib/data/tab-data-server";

export const metadata: Metadata = { title: "HELM — HEALTH" };

export default async function HealthPage() {
  const user = await requireUser();
  return (
    <>
      <AppHeader />
      <TabsApp
        initialView="health"
        initialData={await buildInitialTrio(user.id, "health")}
      />
    </>
  );
}
