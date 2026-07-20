import { NextResponse } from "next/server";
import { buildExport, uploadBackup } from "@/lib/backup";
import { createClient } from "@/lib/supabase/server";

/**
 * Nightly backup endpoint (NFR-4). Two callers:
 * - a Coolify Scheduled Task with `Authorization: Bearer CRON_SECRET`
 * - the signed-in owner (settings page / manual curl with session cookies)
 * Public in the proxy; authorization enforced here.
 *
 * No duration cap: this runs on the owner's own server, so a full export can
 * take as long as it takes. (Deliberately no `maxDuration` — that was a
 * Vercel serverless ceiling and is inert here; see CLAUDE.md Infrastructure.)
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  const bearerOk = Boolean(
    secret && request.headers.get("authorization") === `Bearer ${secret}`,
  );

  let sessionOk = false;
  if (!bearerOk) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    sessionOk = Boolean(user);
  }

  if (!bearerOk && !sessionOk) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dump = await buildExport();
  const { path, bytes } = await uploadBackup(dump);
  return NextResponse.json({ ok: true, path, bytes, counts: dump.counts });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
