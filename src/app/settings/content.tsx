import Link from "next/link";
import { Panel } from "@/components/panel";
import { AiModelPanel } from "@/components/settings/ai-model";
import { AppleCalendarPanel } from "@/components/settings/apple-calendar";
import { GoogleHealthPanel } from "@/components/settings/google-health";
import { NudgeToggle } from "@/components/settings/nudge-toggle";
import { listBackups, type BackupFileInfo } from "@/lib/backup";
import type { ProviderOption } from "@/lib/ai/providers";
import type { ProviderId, Tier } from "@/lib/ai/providers/types";
import type { CaldavConnection } from "@/lib/data/caldav";
import type { GHealthConnection } from "@/lib/data/ghealth";
import { runBackupAction } from "./actions";

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

export async function SettingsContent({
  email,
  backup,
  path,
  nudgeEnabled,
  appleCalendar,
  caldavConfigured,
  aiProviders,
  aiProvider,
  aiTier,
  googleHealth,
  ghealthConfigured,
  ghealthOutcome,
}: {
  userId?: string;
  email: string;
  backup?: string;
  path?: string;
  nudgeEnabled: boolean;
  appleCalendar: CaldavConnection | null;
  caldavConfigured: boolean;
  aiProviders: ProviderOption[];
  aiProvider: ProviderId | null;
  aiTier: Tier;
  googleHealth: GHealthConnection | null;
  ghealthConfigured: boolean;
  ghealthOutcome?: string;
}) {

  let backups: BackupFileInfo[] = [];
  let storageError = false;
  try {
    backups = await listBackups();
  } catch {
    storageError = true;
  }

  return (
      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-3 p-4">
        <Panel label="Account" value="Single user">
          <p className="px-3 py-2.5 font-mono text-[11px] text-muted">
            {email}
          </p>
        </Panel>

        <Panel label="Assistant model" value={aiProviders.length === 0 ? "NOT CONFIGURED" : undefined}>
          <AiModelPanel
            providers={aiProviders}
            provider={aiProvider}
            tier={aiTier}
          />
        </Panel>

        <Panel label="AI features" value="NFR-1">
          <div className="flex flex-col gap-3 p-4">
            <p className="text-[12.5px]">
              Any assistant feature sees only structured summaries assembled by
              one audited code path. Raw journal text is excluded by default.
              Inspect the exact payload that would go to the API — nothing is
              sent from the preview.
            </p>
            <Link
              href="/settings/ai-preview"
              className="self-start border border-border-input bg-subtle px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] no-underline"
            >
              Preview what gets sent →
            </Link>
            <div className="border-t border-border-row pt-3">
              <p className="mb-2 text-[12px]">
                The dashboard shows one data-grounded nudge per day, generated
                once and cached (no cost on every load).
              </p>
              <NudgeToggle enabled={nudgeEnabled} />
            </div>
          </div>
        </Panel>

        <Panel
          label="Apple Calendar"
          value={
            appleCalendar
              ? appleCalendar.status === "broken"
                ? "RECONNECT"
                : "CONNECTED"
              : "NOT CONNECTED"
          }
        >
          <AppleCalendarPanel
            connection={appleCalendar}
            configured={caldavConfigured}
          />
        </Panel>

        <Panel
          label="Google Health"
          value={
            googleHealth
              ? googleHealth.status === "ok"
                ? "CONNECTED"
                : googleHealth.status === "expiring"
                  ? `${Math.max(googleHealth.daysLeft, 0)}D LEFT`
                  : "RECONNECT"
              : "NOT CONNECTED"
          }
        >
          <GoogleHealthPanel
            connection={googleHealth}
            configured={ghealthConfigured}
            outcome={ghealthOutcome}
          />
        </Panel>

        <Panel label="Data & backup" value="NFR-4">
          <div className="flex flex-col gap-3 p-4">
            <p className="text-[12.5px]">
              Everything you log is exportable as one JSON document — every
              core table plus your assistant history, no lock-in. A nightly
              cron writes the same dump to
              the private <span className="font-mono text-[11px]">backups</span>{" "}
              bucket at 02:00 UTC.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="/api/export"
                className="border-0 bg-ink px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#ffffff] no-underline"
              >
                Export my data
              </a>
              <form action={runBackupAction}>
                <button
                  type="submit"
                  className="cursor-pointer border border-border-input bg-subtle px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em]"
                >
                  Back up to storage now
                </button>
              </form>
            </div>
            {backup === "ok" && (
              <p className="font-mono text-[10px] uppercase tracking-[.06em] text-status-good">
                Backup written{path ? ` — ${path}` : ""}
              </p>
            )}
            {backup === "error" && (
              <p className="font-mono text-[10px] uppercase tracking-[.06em] text-status-bad">
                Backup failed — is Storage reachable and the service key set?
              </p>
            )}
          </div>
        </Panel>

        <Panel label="Recent backups" value={`${backups.length}`}>
          {storageError && (
            <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-status-bad">
              Storage unreachable — check SUPABASE_SERVICE_ROLE_KEY
            </p>
          )}
          {!storageError && backups.length === 0 && (
            <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
              No backups yet
            </p>
          )}
          {backups.map((b) => (
            <div
              key={b.name}
              className="flex items-baseline gap-3 border-b border-border-row px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                {b.name}
              </span>
              <span className="flex-none font-mono text-[10px] text-faint">
                {b.createdAt ? b.createdAt.slice(0, 16).replace("T", " ") : ""}
              </span>
              <span className="w-[52px] flex-none text-right font-mono text-[10px] text-muted">
                {kb(b.bytes)}
              </span>
            </div>
          ))}
        </Panel>
      </main>
  );
}
