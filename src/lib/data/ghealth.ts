import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { forUser } from "@/db";
import { events } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

/**
 * The Google Health connection record — hub-and-spoke, no private table.
 *
 * Stored as a config Event (`payload.ghealth`), exactly like the Apple
 * Calendar connection (`payload.caldav`) and the preferences row
 * (`payload.pref`). `calendarVisible` excludes the `ghealth` key; the NFR-4
 * backup redacts the sealed value. One row per owner; reconnecting replaces.
 *
 * The refresh token is stored ENCRYPTED (AES-256-GCM via lib/secrets.ts, key
 * only in the server environment) and decrypted at exactly one point —
 * `refreshTokenOf` — for immediate use, never returned to anything that
 * renders.
 *
 * THE 7-DAY CLOCK. Under Google Cloud "Testing" publishing status, refresh
 * tokens expire 7 days after issue — documented behaviour, not a bug, and
 * the price of staying under the personal-use exception instead of doing a
 * CASA review. So the record keeps `issuedAt` + `expiresAt` (from the token
 * response's refresh_token_expires_in) and `getConnection` derives a state:
 *
 *   ok        → more than 3 days left
 *   expiring  → ≤3 days left: Settings shows the reconnect prompt EARLY
 *   expired   → past expiresAt: syncs will fail; Settings says so plainly
 *   broken    → Google actively rejected the token (revoked early)
 *
 * Expired/broken is a terminal state until the owner reconnects — nothing
 * retries silently.
 */

export const RECONNECT_WARNING_DAYS = 3;

export type GHealthStatus = "ok" | "expiring" | "expired" | "broken";

export type GHealthConnection = {
  healthUserId: string | null;
  scopes: string[];
  issuedAt: string;
  expiresAt: string;
  /** Whole days until the refresh token dies (negative = already dead). */
  daysLeft: number;
  status: GHealthStatus;
  lastError?: string;
  lastSyncAt?: string;
  /** Stage-3 fields: webhook subscriber + per-sync stats. */
  subscriberId?: string;
  lastSync?: { upserted: number; deleted: number; errors: number };
};

type StoredGHealth = Omit<GHealthConnection, "status" | "daysLeft"> & {
  secret: string;
  broken?: boolean;
};
type GHealthPayload = { ghealth: StoredGHealth };

const isGHealth = sql`${events.payload} is not null and jsonb_exists(${events.payload}, 'ghealth')`;

async function row(userId: string) {
  const rows = await forUser(userId).select(events, {
    where: and(eq(events.archived, false), isGHealth),
  });
  return rows[0] ?? null;
}

const DAY_MS = 86_400_000;

function derive(s: StoredGHealth): GHealthConnection {
  // structurally drop the secret — never spread, so nothing new can leak
  const { healthUserId, scopes, issuedAt, expiresAt, lastError, lastSyncAt, subscriberId, lastSync } = s;
  const msLeft = Date.parse(expiresAt) - Date.now();
  const daysLeft = Math.floor(msLeft / DAY_MS);
  const status: GHealthStatus = s.broken
    ? "broken"
    : msLeft <= 0
      ? "expired"
      : msLeft <= RECONNECT_WARNING_DAYS * DAY_MS
        ? "expiring"
        : "ok";
  return { healthUserId, scopes, issuedAt, expiresAt, daysLeft, status, lastError, lastSyncAt, subscriberId, lastSync };
}

/** The connection as the UI may see it: no secret, ever. */
export async function getGHealthConnection(userId: string): Promise<GHealthConnection | null> {
  const r = await row(userId);
  return r ? derive((r.payload as GHealthPayload).ghealth) : null;
}

const DEFAULT_TTL_SECONDS = 7 * 24 * 3600; // documented Testing-mode lifetime

/** Save (or replace) the connection after a successful, CONFIRMED exchange. */
export async function saveGHealthConnection(
  userId: string,
  input: {
    refreshToken: string;
    refreshTokenExpiresInSeconds: number | null;
    healthUserId: string | null;
    scopes: string[];
  },
): Promise<void> {
  const udb = forUser(userId);
  const existing = await row(userId);
  const now = new Date();
  const ttlMs = (input.refreshTokenExpiresInSeconds ?? DEFAULT_TTL_SECONDS) * 1000;
  const prev = existing ? (existing.payload as GHealthPayload).ghealth : null;

  const ghealth: StoredGHealth = {
    secret: encryptSecret(input.refreshToken),
    healthUserId: input.healthUserId ?? prev?.healthUserId ?? null,
    scopes: input.scopes,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    // a fresh token clears any broken state; keep sync history
    lastSyncAt: prev?.lastSyncAt,
    subscriberId: prev?.subscriberId,
    lastSync: prev?.lastSync,
  };
  const payload: GHealthPayload = { ghealth };
  if (existing) {
    await udb.update(events, { payload }, eq(events.id, existing.id));
  } else {
    await udb.insert(events, {
      domain: "health",
      kind: "other",
      title: "Google Health connection",
      start: now,
      payload,
    });
  }
}

/** Decrypted refresh token for immediate use. Server-only call path. */
export async function refreshTokenOf(userId: string): Promise<string | null> {
  const r = await row(userId);
  if (!r) return null;
  return decryptSecret((r.payload as GHealthPayload).ghealth.secret);
}

async function patch(userId: string, changes: Partial<StoredGHealth>): Promise<void> {
  const r = await row(userId);
  if (!r) return;
  const current = (r.payload as GHealthPayload).ghealth;
  const payload: GHealthPayload = { ghealth: { ...current, ...changes } };
  await forUser(userId).update(events, { payload }, eq(events.id, r.id));
}

/** Google rejected the token before its clock ran out (revoked early). The
 * next poll will NOT fix itself — Settings must show Reconnect. */
export async function markGHealthBroken(userId: string, reason: string): Promise<void> {
  await patch(userId, { broken: true, lastError: reason });
}

export async function recordGHealthSync(
  userId: string,
  summary: { upserted: number; deleted: number; errors: number },
): Promise<void> {
  await patch(userId, {
    broken: false,
    lastError: undefined,
    lastSyncAt: new Date().toISOString(),
    lastSync: summary,
  });
}

/** Stage 3: remember the registered webhook subscriber id. */
export async function setGHealthSubscriber(userId: string, subscriberId: string): Promise<void> {
  await patch(userId, { subscriberId });
}

/** Forget the connection ("Disconnect"). Revocation at Google's end happens
 * in the caller (best-effort) — this removes local storage unconditionally. */
export async function deleteGHealthConnection(userId: string): Promise<void> {
  const r = await row(userId);
  if (r) await forUser(userId).delete(events, eq(events.id, r.id));
}
