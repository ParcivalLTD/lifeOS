import { NextResponse } from "next/server";
import { buildExport, uploadBackup } from "@/lib/backup";
import { createClient } from "@/lib/supabase/server";

/**
 * Nightly backup endpoint (NFR-4). Two callers:
 * - Vercel Cron (vercel.json, 02:00 UTC) with `Authorization: Bearer CRON_SECRET`
 * - the signed-in owner (settings page / manual curl with session cookies)
 * Public in the proxy; authorization enforced here.
 */
export const maxDuration = 60;

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
