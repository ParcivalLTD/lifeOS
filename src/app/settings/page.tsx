import type { Metadata } from "next";
import { SettingsContent } from "@/app/settings/content";
import { AppHeader } from "@/components/app-header";
import { TabShell } from "@/components/tab-shell";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "LIFEOS — SETTINGS" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ backup?: string; path?: string }>;
}) {
  const user = await requireUser();
  const { backup, path } = await searchParams;
  return (
    <>
      <AppHeader active="settings" />
      <TabShell active="settings" userId={user.id} email={user.email ?? ""}>
        <SettingsContent email={user.email ?? ""} backup={backup} path={path} />
      </TabShell>
    </>
  );
}
