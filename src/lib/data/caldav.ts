import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { forUser } from "@/db";
import { events } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

/**
 * The Apple Calendar connection record — hub-and-spoke, no private table.
 *
 * Stored as an Event (`domain=personal`, `kind=other`,
 * `payload.caldav = {...}`), the same shape the daily-nudge preference uses.
 * It is configuration, not a life-domain object, so `calendarVisible`
 * excludes the `caldav` key and it never reaches the calendar or dashboard.
 * One row per owner; connecting again replaces it.
 *
 * The app-specific password is stored ENCRYPTED (AES-256-GCM, key only in the
 * server environment). It is decrypted at exactly one point — `credentials()`
 * — and never returned to a caller that renders anything.
 */

export type ConnectionStatus = "ok" | "broken";

export type CaldavConnection = {
  appleId: string;
  status: ConnectionStatus;
  /** Why it broke, in owner-readable terms. Present only when status=broken. */
  lastError?: string;
  lastSyncAt?: string;
  lastSync?: { created: number; updated: number; errors: number; calendars: number };
  /** Non-default CalDAV host. Tests point this at a local mock. */
  baseUrl?: string;
};

/** What is actually persisted: the public record plus the sealed secret. */
type StoredCaldav = CaldavConnection & { secret: string };
type CaldavPayload = { caldav: StoredCaldav };

const isCaldav = sql`${events.payload} is not null and jsonb_exists(${events.payload}, 'caldav')`;

async function row(userId: string) {
  const rows = await forUser(userId).select(events, {
    where: and(eq(events.archived, false), isCaldav),
  });
  return rows[0] ?? null;
}

const publicView = (s: StoredCaldav): CaldavConnection => {
  // structurally drop the secret — never spread-and-delete, so a new secret
  // field added later cannot leak by omission
  const { appleId, status, lastError, lastSyncAt, lastSync, baseUrl } = s;
  return { appleId, status, lastError, lastSyncAt, lastSync, baseUrl };
};

/** The connection as the UI may see it: no secret, ever. */
export async function getConnection(userId: string): Promise<CaldavConnection | null> {
  const r = await row(userId);
  return r ? publicView((r.payload as CaldavPayload).caldav) : null;
}

export async function isConnected(userId: string): Promise<boolean> {
  return (await row(userId)) !== null;
}

/** Save (or replace) the connection, sealing the app-specific password. */
export async function saveConnection(
  userId: string,
  input: { appleId: string; password: string; baseUrl?: string },
): Promise<void> {
  const udb = forUser(userId);
  const existing = await row(userId);
  const caldav: StoredCaldav = {
    appleId: input.appleId,
    secret: encryptSecret(input.password),
    status: "ok",
    baseUrl: input.baseUrl,
    // a fresh connection starts clean: drop any previous failure
    lastSyncAt: existing
      ? (existing.payload as CaldavPayload).caldav.lastSyncAt
      : undefined,
  };
  const payload: CaldavPayload = { caldav };
  if (existing) {
    await udb.update(events, { payload }, eq(events.id, existing.id));
  } else {
    await udb.insert(events, {
      domain: "personal",
      kind: "other",
      title: "Apple Calendar connection",
      start: new Date(),
      payload,
    });
  }
}

/** Decrypted credentials for the sync client. Server-only call path. */
export async function credentials(
  userId: string,
): Promise<{ appleId: string; password: string; baseUrl?: string } | null> {
  const r = await row(userId);
  if (!r) return null;
  const c = (r.payload as CaldavPayload).caldav;
  return { appleId: c.appleId, password: decryptSecret(c.secret), baseUrl: c.baseUrl };
}

async function patch(userId: string, changes: Partial<StoredCaldav>): Promise<void> {
  const r = await row(userId);
  if (!r) return;
  const current = (r.payload as CaldavPayload).caldav;
  const payload: CaldavPayload = { caldav: { ...current, ...changes } };
  await forUser(userId).update(events, { payload }, eq(events.id, r.id));
}

/**
 * Mark the connection unusable. Called when iCloud rejects the credentials —
 * app-specific passwords can be revoked at any time from appleid.apple.com,
 * and the next poll will NOT spontaneously start working, so the owner has to
 * be told rather than the failure being retried forever in silence.
 */
export async function markBroken(userId: string, reason: string): Promise<void> {
  await patch(userId, { status: "broken", lastError: reason });
}

export async function recordSync(
  userId: string,
  summary: { created: number; updated: number; errors: number; calendars: number },
): Promise<void> {
  await patch(userId, {
    status: "ok",
    lastError: undefined,
    lastSyncAt: new Date().toISOString(),
    lastSync: summary,
  });
}

/** Forget the connection entirely (also used by "Disconnect"). */
export async function deleteConnection(userId: string): Promise<void> {
  const r = await row(userId);
  if (r) await forUser(userId).delete(events, eq(events.id, r.id));
}
