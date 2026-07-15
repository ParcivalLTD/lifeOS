import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Signs out (revokes the refresh token) and clears session cookies. */
export async function POST(request: Request) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? request.url;
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", base), { status: 303 });
}
