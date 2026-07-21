import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { TabsApp } from "@/components/tabs/tabs-app";
import { requireUser } from "@/lib/auth";
import { buildInitialTrio } from "@/lib/data/tab-data-server";

export const metadata: Metadata = { title: "HELM — ASSISTANT" };

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const user = await requireUser();
  const { c } = await searchParams;
  return (
    <>
      <AppHeader />
      <TabsApp initialView="chat" initialData={await buildInitialTrio(user.id, "chat", { c })} />
    </>
  );
}
