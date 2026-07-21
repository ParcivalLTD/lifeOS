import { NextResponse, after } from "next/server";
import { handleNotification } from "@/lib/ghealth/sync";
import { parseNotification, verifyWebhookSignature, webhookSecretOk } from "@/lib/ghealth/webhook";

/**
 * Google Health webhook receiver (push sync). Public in the proxy — Google's
 * servers have no session — so BOTH documented security layers are enforced
 * here, in order:
 *
 *  1. the shared secret we registered in `endpointAuthorization.secret`
 *     (constant-time compare) — a miss is 401, which is also what Google's
 *     endpoint-verification handshake expects from an unauthorized probe;
 *  2. the GOOGLE-HEALTH-API-SIGNATURE over the RAW body (Tink ECDSA P-256
 *     against Google's published keyset) — a miss is 403.
 *
 * A verified request is acknowledged 204 IMMEDIATELY; the actual re-sync of
 * the notified intervals runs via after() so Google's delivery timeout can't
 * bite. Retried deliveries are harmless: the sync upserts on
 * (user_id, source, external_id), so replaying a notification rewrites the
 * same rows.
 *
 * Single-tenant: notifications are for the owner (SEED_USER_ID), same
 * convention as the backup and CalDAV sync scheduled routes.
 */
export async function POST(request: Request) {
  if (!webhookSecretOk(request.headers.get("authorization"))) {
    return new NextResponse(null, { status: 401 });
  }

  const rawBody = await request.text();
  const signed = await verifyWebhookSignature(
    rawBody,
    request.headers.get("google-health-api-signature"),
  );
  if (!signed) return new NextResponse(null, { status: 403 });

  const notification = parseNotification(rawBody);
  // Verification handshake, unknown data type, or malformed body: an
  // authorized+signed request is acknowledged so Google doesn't retry it —
  // there is just nothing to sync.
  if (!notification) return new NextResponse(null, { status: 204 });

  const userId = process.env.SEED_USER_ID;
  if (!userId) {
    console.error("google health webhook: SEED_USER_ID is not set");
    return new NextResponse(null, { status: 204 });
  }

  after(async () => {
    try {
      await handleNotification(userId, notification);
    } catch (err) {
      console.error("google health webhook sync failed", err);
    }
  });

  return new NextResponse(null, { status: 204 });
}
