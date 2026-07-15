import { NextResponse } from "next/server";
import { buildExport } from "@/lib/backup";
import { createClient } from "@/lib/supabase/server";

/** Manual "export my data" download — owner session required. */
export const maxDuration = 60;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dump = await buildExport();
  const filename = `lifeos-export-${dump.generatedAt.slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(dump, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
