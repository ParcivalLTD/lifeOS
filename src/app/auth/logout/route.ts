import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Signs out (revokes the refresh token) and clears session cookies. */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
