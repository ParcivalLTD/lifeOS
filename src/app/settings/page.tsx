import type { Metadata } from "next";
import { SettingsContent } from "@/app/settings/content";
import { AppHeader } from "@/components/app-header";
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
      <AppHeader />
      <SettingsContent email={user.email ?? ""} backup={backup} path={path} />
    </>
  );
}
