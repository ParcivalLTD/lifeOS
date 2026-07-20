import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { TabsApp } from "@/components/tabs/tabs-app";
import { requireUser } from "@/lib/auth";
import { buildInitialTrio } from "@/lib/data/tab-data-server";

export const metadata: Metadata = { title: "HELM — WORK" };

export default async function WorkPage() {
  const user = await requireUser();
  return (
    <>
      <AppHeader />
      <TabsApp initialView="work" initialData={await buildInitialTrio(user.id, "work")} />
    </>
  );
}
