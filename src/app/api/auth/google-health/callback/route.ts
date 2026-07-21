import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { exchangeCode, confirmAccess, registerWebhookSubscriber } from "@/lib/ghealth/client";
import { saveGHealthConnection, setGHealthSubscriber } from "@/lib/data/ghealth";
import { SUBSCRIBED_DATA_TYPES } from "@/lib/ghealth/mapping";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth callback: Google redirects the OWNER'S BROWSER here with a code, so
 * the session cookie rides along and the normal auth gate applies.
 *
 * Order is deliberate: exchange → CONFIRM against the live API → only then
 * store. A token that cannot actually read the Health API is never saved, so
 * a misconfigured consent (wrong scopes, wrong project) fails here loudly
 * instead of becoming a broken connection discovered at the first webhook.
 *
 * After the save, the webhook subscriber is registered for the synced data
 * types (steps/weight/sleep/HR/HRV/SpO2/nutrition/exercise). Registration
 * needs GOOGLE_HEALTH_PROJECT_ID + GOOGLE_HEALTH_WEBHOOK_SECRET and a
 * publicly reachable NEXT_PUBLIC_SITE_URL (Google probes the endpoint
 * synchronously during the call). A registration failure downgrades to
 * "connected, webhooks pending" — the connection itself is kept, and Settings
 * shows the outcome; re-running Connect retries registration.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const back = (outcome: string) =>
    NextResponse.redirect(new URL(`/settings?ghealth=${outcome}`, base), { status: 303 });

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error")) return back("denied"); // owner said no at the consent screen
  if (!code || !state) return back("error");

  const jar = await cookies();
  const expected = jar.get("ghealth_oauth_state")?.value;
  jar.delete("ghealth_oauth_state");
  if (!expected || expected !== state) return back("state-mismatch");

  const redirectUri = new URL("/api/auth/google-health/callback", base).toString();

  try {
    const grant = await exchangeCode(code, redirectUri);
    const { healthUserId } = await confirmAccess(grant.accessToken);
    await saveGHealthConnection(user.id, {
      refreshToken: grant.refreshToken,
      refreshTokenExpiresInSeconds: grant.refreshTokenExpiresInSeconds,
      healthUserId,
      scopes: grant.scopes,
    });

    // Webhook subscriber registration (push sync). Optional config: without
    // a project id + webhook secret the connection still works, it just has
    // no push channel yet.
    const projectId = process.env.GOOGLE_HEALTH_PROJECT_ID;
    const webhookSecret = process.env.GOOGLE_HEALTH_WEBHOOK_SECRET;
    if (!projectId || !webhookSecret) return back("ok-no-webhook");

    const subscriberId = "helm";
    const reg = await registerWebhookSubscriber(grant.accessToken, {
      projectId,
      subscriberId,
      endpointUri: new URL("/api/webhooks/google-health", base).toString(),
      secret: webhookSecret,
      dataTypes: SUBSCRIBED_DATA_TYPES,
    });
    if (!reg.ok) {
      console.error("google health subscriber registration failed:", reg.detail);
      return back("ok-no-webhook");
    }
    await setGHealthSubscriber(user.id, subscriberId);
    return back("ok");
  } catch (err) {
    console.error("google health connect failed:", err);
    return back("error");
  }
}
