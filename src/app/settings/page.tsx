import type { Metadata } from "next";
import { SettingsContent } from "@/app/settings/content";
import { AppHeader } from "@/components/app-header";
import { requireUser } from "@/lib/auth";
import { availableProviders, DEFAULT_TIER } from "@/lib/ai/client";
import { getConnection } from "@/lib/data/caldav";
import { getGHealthConnection } from "@/lib/data/ghealth";
import { ghealthConfigured } from "@/lib/ghealth/client";
import { getPreferences } from "@/lib/data/preferences";
import { getNudgeEnabled } from "@/lib/data/nudge";
import { encryptionConfigured } from "@/lib/secrets";

export const metadata: Metadata = { title: "HELM — SETTINGS" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ backup?: string; path?: string; ghealth?: string }>;
}) {
  const user = await requireUser();
  const { backup, path, ghealth } = await searchParams;
  const [nudgeEnabled, appleCalendar, prefs, googleHealth] = await Promise.all([
    getNudgeEnabled(user.id),
    getConnection(user.id),
    getPreferences(user.id),
    getGHealthConnection(user.id),
  ]);
  return (
    <>
      <AppHeader />
      <SettingsContent
        email={user.email ?? ""}
        backup={backup}
        path={path}
        nudgeEnabled={nudgeEnabled}
        appleCalendar={appleCalendar}
        caldavConfigured={encryptionConfigured()}
        aiProviders={availableProviders()}
        aiProvider={prefs.aiProvider ?? null}
        aiTier={prefs.aiTier ?? DEFAULT_TIER}
        googleHealth={googleHealth}
        ghealthConfigured={ghealthConfigured()}
        ghealthOutcome={ghealth}
      />
    </>
  );
}
