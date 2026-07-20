import { NextResponse } from "next/server";
import { syncAppleCalendar } from "@/lib/caldav/sync";
import { secretEquals } from "@/lib/secrets";
import { createClient } from "@/lib/supabase/server";

/**
 * Apple Calendar sync trigger (iCloud → Helm, one way). Two callers, exactly
 * like the nightly backup route:
 * - a Coolify Scheduled Task with `Authorization: Bearer CALDAV_SYNC_SECRET`
 *   (every 15 minutes — see README)
 * - the signed-in owner ("Sync now" in Settings, via session cookies)
 *
 * Public in the proxy; authorization enforced here. No duration cap — this
 * runs on our own server, so a slow account can take as long as it needs.
 */

const OWNER_ID = process.env.SEED_USER_ID;

async function handle(request: Request) {
  const secret = process.env.CALDAV_SYNC_SECRET;
  const bearerOk = secretEquals(
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null,
    secret,
  );

  // A scheduled task has no session, so it names the owner via env; an
  // interactive call uses the signed-in user.
  let userId: string | null = null;
  if (bearerOk) {
    userId = OWNER_ID ?? null;
    if (!userId) {
      return NextResponse.json(
        { error: "server-misconfigured", detail: "SEED_USER_ID is not set" },
        { status: 500 },
      );
    }
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  }

  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await syncAppleCalendar(userId);

  if (!result.ok) {
    // 409 for auth-failed: the request was fine, the stored credential is not.
    // The connection is already marked broken, so Settings shows Reconnect.
    const status =
      result.reason === "not-connected" ? 404 : result.reason === "auth-failed" ? 409 : 500;
    return NextResponse.json(
      { ok: false, reason: result.reason, error: result.message },
      { status },
    );
  }

  return NextResponse.json({ ok: true, ...result.summary });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
