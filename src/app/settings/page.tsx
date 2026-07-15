import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { Panel } from "@/components/panel";
import { requireUser } from "@/lib/auth";
import { listBackups, type BackupFileInfo } from "@/lib/backup";
import { runBackupAction } from "./actions";

export const metadata: Metadata = { title: "LIFEOS — SETTINGS" };

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ backup?: string; path?: string }>;
}) {
  const user = await requireUser();
  const { backup, path } = await searchParams;

  let backups: BackupFileInfo[] = [];
  let storageError = false;
  try {
    backups = await listBackups();
  } catch {
    storageError = true;
  }

  return (
    <>
      <AppHeader active="settings" />
      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-3 p-4">
        <Panel label="Account" value="Single user">
          <p className="px-3 py-2.5 font-mono text-[11px] text-muted">
            {user.email}
          </p>
        </Panel>

        <Panel label="Data & backup" value="NFR-4">
          <div className="flex flex-col gap-3 p-4">
            <p className="text-[12.5px]">
              Everything you log is exportable as one JSON document — all nine
              core tables, no lock-in. A nightly cron writes the same dump to
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
    </>
  );
}
