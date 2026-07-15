import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Password sign-in via plain HTML form POST — no client JS required.
 * On failure, redirects back to /login with a generic error flag (no
 * credential detail leaks).
 */
export async function POST(request: Request) {
  const redirectTo = (path: string) =>
    NextResponse.redirect(new URL(path, request.url), { status: 303 });

  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");

  if (!email || !password) {
    return redirectTo("/login?error=credentials");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return redirectTo("/login?error=credentials");
  }

  return redirectTo("/");
}
