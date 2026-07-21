"use client";

import { useState, useTransition } from "react";
import { disconnectGoogleHealthAction } from "@/app/settings/actions";
import type { GHealthConnection } from "@/lib/data/ghealth";

const primary =
  "inline-block cursor-pointer border-0 bg-ink px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#ffffff] no-underline disabled:opacity-50";
const secondary =
  "cursor-pointer border border-border-input bg-subtle px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] disabled:opacity-50";

/** One-shot outcome line after returning from the OAuth flow. */
const OUTCOME: Record<string, { text: string; bad: boolean }> = {
  ok: { text: "Connected — token verified, webhook subscriber registered.", bad: false },
  "ok-no-webhook": {
    text: "Connected, but webhook registration is pending — set GOOGLE_HEALTH_PROJECT_ID + GOOGLE_HEALTH_WEBHOOK_SECRET (and a public site URL), then reconnect.",
    bad: true,
  },
  denied: { text: "Connection cancelled at the Google consent screen.", bad: true },
  "state-mismatch": { text: "Connection failed a security check (state mismatch). Try again.", bad: true },
  error: { text: "Connection failed — see the server log for the exact error.", bad: true },
};

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-2.5 border-b border-border-row px-3 py-1.5">
      <span className="w-[86px] flex-none font-mono text-[9px] font-semibold uppercase tracking-[.07em] text-faint">
        {k}
      </span>
      <span className="min-w-0 flex-1 break-words text-[12.5px]">{v}</span>
    </div>
  );
}

/**
 * Google Health connection panel.
 *
 * The 7-day countdown is the centrepiece: under Google Cloud "Testing"
 * publishing status (the personal-use setup — no CASA review for a single
 * user), refresh tokens EXPIRE AFTER 7 DAYS by design. So this panel always
 * shows time remaining, starts prompting to reconnect at ≤3 days, and shows
 * an explicit expired/broken state — never a silent failure.
 */
export function GoogleHealthPanel({
  connection,
  configured,
  outcome,
}: {
  connection: GHealthConnection | null;
  configured: boolean;
  outcome?: string;
}) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const note = outcome ? OUTCOME[outcome] : undefined;

  if (!configured) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <p className="text-[12.5px]">
          Set <span className="font-mono text-[11px]">GOOGLE_HEALTH_CLIENT_ID</span> and{" "}
          <span className="font-mono text-[11px]">GOOGLE_HEALTH_CLIENT_SECRET</span> in the
          server environment to enable Google Health sync.
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[.05em] text-faintest">
          Google Cloud console → create an OAuth web client → keep the app in
          Testing status with your account as the sole test user
        </p>
      </div>
    );
  }

  if (!connection) {
    return (
      <div className="flex flex-col gap-3 p-4">
        {note && (
          <p className={`font-mono text-[10px] uppercase tracking-[.04em] ${note.bad ? "text-status-bad" : "text-status-good"}`}>
            {note.text}
          </p>
        )}
        <p className="text-[12.5px]">
          Sync steps, weight, sleep, heart data and nutrition from Google
          Health into Helm. Read-only — Helm never writes health data back.
        </p>
        <ol className="flex list-decimal flex-col gap-1.5 pl-4 text-[12.5px]">
          <li>
            The Google Cloud project stays in <b>Testing</b> publishing status —
            fine for personal use (no CASA verification needed for a single
            user), with your Google account added as the sole test user.
          </li>
          <li>
            The trade-off: Testing-status tokens <b>expire every 7 days</b>.
            That is documented Google behaviour, not a bug — this panel counts
            down and prompts you to reconnect before it lapses.
          </li>
        </ol>
        <a href="/api/auth/google-health" className={`${primary} self-start`}>
          Connect Google Health
        </a>
        <p className="font-mono text-[9px] uppercase tracking-[.05em] text-faintest">
          Refresh token stored encrypted on the server, never sent to the
          browser · scopes: activity & fitness, health metrics, sleep, nutrition
          (read-only)
        </p>
      </div>
    );
  }

  const needsReconnect = connection.status !== "ok";
  const statusLine =
    connection.status === "ok"
      ? `Token healthy — expires in ${connection.daysLeft} day${connection.daysLeft === 1 ? "" : "s"}`
      : connection.status === "expiring"
        ? `Token expires in ${Math.max(connection.daysLeft, 0)} day${connection.daysLeft === 1 ? "" : "s"} — reconnect soon`
        : connection.status === "expired"
          ? "Token EXPIRED — syncing has stopped until you reconnect"
          : "Google rejected the stored token — syncing has stopped until you reconnect";

  return (
    <div className="flex flex-col">
      {note && (
        <p className={`border-b border-border-row px-3 py-2 font-mono text-[10px] uppercase tracking-[.04em] ${note.bad ? "text-status-bad" : "text-status-good"}`}>
          {note.text}
        </p>
      )}

      <div
        className={`border-b border-border-row px-3 py-2.5 ${needsReconnect ? "bg-subtle" : ""}`}
      >
        <p
          className={`font-mono text-[10px] font-semibold uppercase tracking-[.06em] ${
            connection.status === "ok"
              ? "text-status-good"
              : connection.status === "expiring"
                ? "text-status-warn"
                : "text-status-bad"
          }`}
        >
          {statusLine}
        </p>
        {needsReconnect && (
          <p className="mt-1 text-[12.5px]">
            Testing-status tokens live 7 days by design. Reconnecting takes one
            consent screen and restores the full 7-day window.
            {connection.lastError ? ` (${connection.lastError})` : ""}
          </p>
        )}
      </div>

      <Row k="Connected" v={new Date(connection.issuedAt).toLocaleString()} />
      <Row k="Expires" v={new Date(connection.expiresAt).toLocaleString()} />
      {connection.healthUserId && <Row k="Health user" v={connection.healthUserId} />}
      <Row
        k="Last sync"
        v={
          connection.lastSyncAt
            ? `${new Date(connection.lastSyncAt).toLocaleString()}${
                connection.lastSync
                  ? ` — ${connection.lastSync.upserted} upserted, ${connection.lastSync.errors} errors`
                  : ""
              }`
            : "never"
        }
      />

      <div className="flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <a href="/api/auth/google-health" className={primary}>
            {needsReconnect ? "Reconnect Google Health" : "Reconnect now"}
          </a>
          {!confirming ? (
            <button type="button" disabled={pending} className={secondary} onClick={() => setConfirming(true)}>
              Disconnect
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={pending}
                className={secondary}
                onClick={() =>
                  start(async () => {
                    await disconnectGoogleHealthAction();
                    setConfirming(false);
                  })
                }
              >
                {pending ? "Disconnecting…" : "Confirm disconnect"}
              </button>
              <button type="button" disabled={pending} className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[10px] uppercase text-faint underline underline-offset-2" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </>
          )}
        </div>
        <p className="font-mono text-[9px] uppercase tracking-[.05em] text-faintest">
          Disconnect revokes the grant at Google and deletes the stored token ·
          synced data stays
        </p>
      </div>
    </div>
  );
}
