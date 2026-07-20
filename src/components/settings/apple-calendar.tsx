"use client";

import { useState, useTransition } from "react";
import {
  connectAppleCalendarAction,
  disconnectAppleCalendarAction,
  syncAppleCalendarAction,
} from "@/app/settings/actions";
import type { CaldavConnection } from "@/lib/data/caldav";

const label = "font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faint";
const input = "w-full border border-border-input bg-subtle px-2.5 py-2 text-[12.5px]";
const primary =
  "cursor-pointer border-0 bg-ink px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#ffffff] disabled:opacity-50";
const secondary =
  "cursor-pointer border border-border-input bg-subtle px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] disabled:opacity-50";

/** The manual step Apple requires — spelled out, because it cannot be
 * automated: iCloud refuses a plain account password over CalDAV. */
function Instructions() {
  return (
    <ol className="flex list-decimal flex-col gap-1.5 pl-4 text-[12.5px]">
      <li>
        Two-factor authentication must already be on for your Apple ID — Apple
        only offers app-specific passwords when it is.
      </li>
      <li>
        Go to{" "}
        <a href="https://appleid.apple.com" target="_blank" rel="noreferrer">
          appleid.apple.com
        </a>{" "}
        → Sign-In and Security → App-Specific Passwords.
      </li>
      <li>Generate one, name it something like &ldquo;Helm&rdquo;, and copy it.</li>
      <li>
        Paste it below with your Apple ID. Your normal Apple password will not
        work here.
      </li>
    </ol>
  );
}

function ConnectForm({ mode }: { mode: "connect" | "reconnect" }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-3"
      action={(fd) =>
        start(async () => {
          setError(null);
          const res = await connectAppleCalendarAction(fd);
          if (res?.error) setError(res.error);
        })
      }
    >
      <label className="flex flex-col gap-1.5">
        <span className={label}>Apple ID</span>
        <input
          name="appleId"
          type="email"
          required
          autoComplete="username"
          placeholder="you@icloud.com"
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={label}>App-specific password</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="off"
          placeholder="xxxx-xxxx-xxxx-xxxx"
          className={`${input} font-mono`}
        />
      </label>

      {error && (
        <div className="border border-status-bad px-3 py-2 font-mono text-[10px] uppercase tracking-[.03em] text-status-bad">
          {error}
        </div>
      )}

      <button type="submit" disabled={pending} className={`${primary} self-start`}>
        {pending
          ? "Checking…"
          : mode === "reconnect"
            ? "Reconnect Apple Calendar"
            : "Connect Apple Calendar"}
      </button>
      <p className="font-mono text-[9px] uppercase tracking-[.05em] text-faintest">
        Stored encrypted on the server, never sent to the browser · one-way
        sync: Helm never writes to iCloud
      </p>
    </form>
  );
}

function StatusRows({ connection }: { connection: CaldavConnection }) {
  const s = connection.lastSync;
  const rows: [string, string][] = [
    ["Apple ID", connection.appleId],
    [
      "Last sync",
      connection.lastSyncAt
        ? new Date(connection.lastSyncAt).toLocaleString()
        : "never",
    ],
  ];
  if (s) {
    rows.push([
      "Last result",
      `${s.created} created · ${s.updated} updated · ${s.errors} error${s.errors === 1 ? "" : "s"} · ${s.calendars} calendar${s.calendars === 1 ? "" : "s"}`,
    ]);
  }
  return (
    <>
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline gap-2.5 border-b border-border-row px-3 py-1.5">
          <span className="w-[86px] flex-none font-mono text-[9px] font-semibold uppercase tracking-[.07em] text-faint">
            {k}
          </span>
          <span className="min-w-0 flex-1 break-words text-[12.5px]">{v}</span>
        </div>
      ))}
    </>
  );
}

/**
 * Apple Calendar connection panel.
 *
 * Three states, and the broken one is the point: an app-specific password can
 * be revoked at appleid.apple.com at any time, and the next poll will not
 * spontaneously recover. When sync records `status: "broken"` this shows an
 * explicit RECONNECT state with the reason, rather than quietly showing a
 * stale "last synced" time forever.
 */
export function AppleCalendarPanel({
  connection,
  configured,
}: {
  connection: CaldavConnection | null;
  configured: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  if (!configured) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <p className="text-[12.5px]">
          Set <span className="font-mono text-[11px]">CALDAV_ENCRYPTION_KEY</span>{" "}
          in the server environment to enable Apple Calendar sync — credentials
          are never stored without it.
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[.05em] text-faint">
          openssl rand -base64 32
        </p>
      </div>
    );
  }

  if (!connection) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <p className="text-[12.5px]">
          Mirror your iCloud calendars into Helm. One way only — Helm reads
          iCloud and never writes back, so nothing here can change your Apple
          calendar.
        </p>
        <Instructions />
        <ConnectForm mode="connect" />
      </div>
    );
  }

  const broken = connection.status === "broken";

  return (
    <div className="flex flex-col">
      {broken && (
        <div className="border-b border-border-row bg-subtle px-3 py-2.5">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[.06em] text-status-bad">
            Reconnect needed
          </p>
          <p className="mt-1 text-[12.5px]">
            iCloud rejected the stored credentials, so syncing has stopped.
            App-specific passwords can be revoked from appleid.apple.com at any
            time — this will not fix itself on the next poll. Generate a new one
            and reconnect below.
          </p>
          {connection.lastError && (
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[.04em] text-faint">
              {connection.lastError}
            </p>
          )}
        </div>
      )}

      <StatusRows connection={connection} />

      {broken ? (
        <div className="flex flex-col gap-3 p-4">
          <Instructions />
          <ConnectForm mode="reconnect" />
        </div>
      ) : (
        <div className="flex flex-col gap-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending}
              className={primary}
              onClick={() =>
                start(async () => {
                  setResult(null);
                  const res = await syncAppleCalendarAction();
                  setResult(res.message);
                })
              }
            >
              {pending ? "Syncing…" : "Sync now"}
            </button>
            <button
              type="button"
              disabled={pending}
              className={secondary}
              onClick={() => start(async () => void (await disconnectAppleCalendarAction()))}
            >
              Disconnect
            </button>
          </div>
          {result && (
            <p className="font-mono text-[10px] uppercase tracking-[.04em] text-muted">
              {result}
            </p>
          )}
          <p className="font-mono text-[9px] uppercase tracking-[.05em] text-faintest">
            A Coolify scheduled task syncs every 15 minutes · read-only
          </p>
        </div>
      )}
    </div>
  );
}
