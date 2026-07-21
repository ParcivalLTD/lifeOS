import "server-only";

import { createPublicKey, timingSafeEqual, verify as cryptoVerify } from "node:crypto";
import { isSubscribedDataType, type DataTypeKey } from "./mapping";

/**
 * Webhook security, per Google's documented requirements (webhooks docs,
 * fetched 2026-07-21). BOTH layers are enforced — neither is optional:
 *
 *  1. SHARED SECRET. Every notification carries the `Authorization` value we
 *     registered in `endpointAuthorization.secret` (GOOGLE_HEALTH_WEBHOOK_SECRET
 *     here). Constant-time compare. This also satisfies Google's endpoint
 *     verification handshake, which probes that an unauthorized request gets
 *     401/403 and an authorized one 2xx.
 *
 *  2. SIGNATURE. The raw JSON payload is signed with Tink's PublicKeySign;
 *     the `GOOGLE-HEALTH-API-SIGNATURE` header is base64 of a 5-byte Tink
 *     prefix (0x01 version + 4-byte big-endian key id) followed by a
 *     DER-encoded ECDSA P-256/SHA-256 signature. The public keyset is a Tink
 *     JSON keyset at a permanent gstatic URL, rotated every ~30 days — so
 *     the keyset is cached in memory and refetched when an unknown key id
 *     appears. Verification is done manually with node:crypto (Google's
 *     documented no-Tink path): parse the EcdsaPublicKey protobuf out of the
 *     keyset entry (x = field 3, y = field 4), build a JWK, verify DER.
 *
 * GOOGLE_HEALTH_KEYSET_URL is a test-only override so the verify suite can
 * sign payloads with its own P-256 key and serve a matching keyset — the
 * production default is Google's permanent URL.
 */

const KEYSET_URL = () =>
  process.env.GOOGLE_HEALTH_KEYSET_URL ||
  "https://www.gstatic.com/googlehealthapi/webhooks/webhooks_public_keyset.json";

// --- layer 1: shared secret --------------------------------------------------

export function webhookSecretOk(authorizationHeader: string | null): boolean {
  const expected = process.env.GOOGLE_HEALTH_WEBHOOK_SECRET;
  if (!expected || !authorizationHeader) return false;
  const a = Buffer.from(authorizationHeader);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// --- layer 2: signature --------------------------------------------------------

/** Minimal protobuf walk: returns the raw bytes of length-delimited `field`.
 * Tolerates unknown fields (varint/fixed types are skipped), which is all we
 * need to pull x/y out of a serialized EcdsaPublicKey. */
function protoField(buf: Buffer, field: number): Buffer | null {
  let i = 0;
  while (i < buf.length) {
    let shift = 0;
    let tag = 0;
    for (;;) {
      const b = buf[i++];
      tag |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    const fieldNo = tag >>> 3;
    const wire = tag & 7;
    if (wire === 0) {
      while (i < buf.length && (buf[i++] & 0x80) !== 0); // varint
    } else if (wire === 2) {
      let len = 0;
      shift = 0;
      for (;;) {
        const b = buf[i++];
        len |= (b & 0x7f) << shift;
        if ((b & 0x80) === 0) break;
        shift += 7;
      }
      if (fieldNo === field) return buf.subarray(i, i + len);
      i += len;
    } else if (wire === 5) {
      i += 4;
    } else if (wire === 1) {
      i += 8;
    } else {
      return null; // groups/unknown — bail rather than misparse
    }
  }
  return null;
}

/** Big-endian coordinate → exactly 32 bytes (strip pads, re-pad left). */
function coord32(raw: Buffer): Buffer {
  let start = 0;
  while (start < raw.length - 1 && raw[start] === 0) start++;
  const trimmed = raw.subarray(start);
  if (trimmed.length > 32) throw new Error("EC coordinate longer than 32 bytes");
  return Buffer.concat([Buffer.alloc(32 - trimmed.length), trimmed]);
}

type TinkKeyset = {
  key?: {
    keyId?: number;
    status?: string;
    keyData?: { typeUrl?: string; value?: string };
  }[];
};

/** keyId → node KeyObject, built from the keyset's EcdsaPublicKey protos. */
let keyCache: Map<number, ReturnType<typeof createPublicKey>> | null = null;

async function loadKeyset(force = false): Promise<Map<number, ReturnType<typeof createPublicKey>>> {
  if (keyCache && !force) return keyCache;
  const res = await fetch(KEYSET_URL(), { cache: "no-store" });
  if (!res.ok) throw new Error(`webhook keyset fetch failed: ${res.status}`);
  const keyset = (await res.json()) as TinkKeyset;
  const map = new Map<number, ReturnType<typeof createPublicKey>>();
  for (const entry of keyset.key ?? []) {
    if (entry.status !== "ENABLED" || typeof entry.keyId !== "number") continue;
    const value = entry.keyData?.value;
    if (!value) continue;
    const proto = Buffer.from(value, "base64");
    const x = protoField(proto, 3);
    const y = protoField(proto, 4);
    if (!x || !y) continue;
    map.set(
      entry.keyId,
      createPublicKey({
        key: {
          kty: "EC",
          crv: "P-256",
          x: coord32(x).toString("base64url"),
          y: coord32(y).toString("base64url"),
        },
        format: "jwk",
      }),
    );
  }
  keyCache = map;
  return map;
}

/** For tests: drop the cached keyset (e.g. after rotating the mock's key). */
export function resetKeysetCache(): void {
  keyCache = null;
}

/**
 * Verify GOOGLE-HEALTH-API-SIGNATURE over the RAW request body. Returns false
 * (never throws) on any malformed input — a bad signature is a rejected
 * request, not a server error.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!signatureHeader) return false;
  let sig: Buffer;
  try {
    sig = Buffer.from(signatureHeader, "base64");
  } catch {
    return false;
  }
  if (sig.length < 6 || sig[0] !== 0x01) return false; // Tink prefix: version byte
  const keyId = sig.readUInt32BE(1);
  const der = sig.subarray(5);

  try {
    let keys = await loadKeyset();
    if (!keys.has(keyId)) keys = await loadKeyset(true); // rotation: refetch once
    const key = keys.get(keyId);
    if (!key) return false;
    return cryptoVerify("sha256", Buffer.from(rawBody, "utf8"), key, der);
  } catch {
    return false;
  }
}

// --- payload parsing -----------------------------------------------------------

export type WebhookNotification = {
  healthUserId: string | null;
  operation: "UPSERT" | "DELETE";
  dataType: DataTypeKey;
  /** Physical UTC intervals of changed data. */
  intervals: { start: string; end: string }[];
};

/** Parse + validate a notification body. Null = not a data notification we
 * act on (unknown type, malformed, or the verification handshake). */
export function parseNotification(rawBody: string): WebhookNotification | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const root = parsed as { type?: unknown; data?: unknown };
  if (root.type === "verification") return null; // handshake probe — 2xx, no work
  const data = root.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== "object") return null;

  const dataType = typeof data.dataType === "string" ? data.dataType : "";
  if (!isSubscribedDataType(dataType)) return null;
  const operation = data.operation === "DELETE" ? "DELETE" : "UPSERT";

  const intervals: { start: string; end: string }[] = [];
  for (const raw of Array.isArray(data.intervals) ? data.intervals : []) {
    const iv = raw as { physicalTimeInterval?: { startTime?: unknown; endTime?: unknown } };
    const start = iv?.physicalTimeInterval?.startTime;
    const end = iv?.physicalTimeInterval?.endTime;
    if (typeof start === "string" && typeof end === "string") {
      intervals.push({ start, end });
    }
  }
  if (intervals.length === 0) return null;

  return {
    healthUserId: typeof data.healthUserId === "string" ? data.healthUserId : null,
    operation,
    dataType,
    intervals,
  };
}
