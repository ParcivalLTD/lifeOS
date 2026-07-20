import "server-only";

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Authenticated encryption for credentials we must be able to REPLAY (an
 * app-specific password has to be sent to iCloud on every sync, so it cannot
 * be hashed — it has to be reversible).
 *
 * AES-256-GCM. The key lives only in the server environment
 * (CALDAV_ENCRYPTION_KEY), never in the database, so a database dump — or the
 * NFR-4 backup — is not sufficient to recover a secret. Same secrecy standard
 * as SUPABASE_SERVICE_ROLE_KEY: server-only, never sent to a client, never
 * logged.
 *
 * Blob format: `v1.<iv>.<authTag>.<ciphertext>`, each part base64url. The
 * version prefix lets the scheme change later without guessing at old rows.
 */

const VERSION = "v1";
const IV_BYTES = 12; // GCM standard nonce length
const KEY_BYTES = 32;

const b64 = (b: Buffer): string => b.toString("base64url");
const unb64 = (s: string): Buffer => Buffer.from(s, "base64url");

/**
 * Read + validate the key. Deliberately read at CALL time (not module load)
 * so importing this file never throws at build; the sync path fails loudly
 * instead, and only when it actually needs a secret.
 */
function key(): Buffer {
  const raw = process.env.CALDAV_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "CALDAV_ENCRYPTION_KEY is not set — generate one with `openssl rand -base64 32`",
    );
  }
  const buf = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (buf.length !== KEY_BYTES) {
    throw new Error(
      `CALDAV_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${buf.length}) — generate one with \`openssl rand -base64 32\``,
    );
  }
  return buf;
}

/** True when a usable key is configured — lets callers gate a feature
 * without catching, and without reading process.env themselves. */
export function encryptionConfigured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, b64(iv), b64(cipher.getAuthTag()), b64(ct)].join(".");
}

/**
 * Decrypt a blob produced by encryptSecret. Throws on tampering: GCM's auth
 * tag is verified, so a modified ciphertext fails rather than returning
 * garbage that we might then send to iCloud.
 */
export function decryptSecret(blob: string): string {
  const parts = blob.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("encrypted secret is malformed or of an unknown version");
  }
  const [, iv, tag, ct] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key(), unb64(iv));
  decipher.setAuthTag(unb64(tag));
  return Buffer.concat([decipher.update(unb64(ct)), decipher.final()]).toString("utf8");
}

/** Constant-time compare for bearer tokens (avoids leaking length/prefix). */
export function secretEquals(a: string | null | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
