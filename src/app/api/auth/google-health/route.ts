import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authorizeUrl, ghealthConfigured } from "@/lib/ghealth/client";
import { createClient } from "@/lib/supabase/server";

/**
 * Start of the Google Health OAuth flow: owner clicks Connect in Settings,
 * this sends their browser to Google's consent screen. Owner session
 * required — this is not a public route (unlike the webhook endpoint), so
 * the proxy's normal gate applies and no exception is registered.
 *
 * CSRF: a random `state` goes both into the authorize URL and an httpOnly
 * cookie; the callback requires them to match. sameSite=lax survives the
 * top-level redirect back from Google.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!ghealthConfigured()) {
    return NextResponse.json({ error: "not-configured" }, { status: 503 });
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const redirectUri = new URL("/api/auth/google-health/callback", base).toString();
  const state = randomBytes(24).toString("base64url");

  const jar = await cookies();
  jar.set("ghealth_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: base.startsWith("https"),
    maxAge: 600,
    path: "/api/auth/google-health",
  });

  return NextResponse.redirect(authorizeUrl(redirectUri, state), { status: 302 });
}
