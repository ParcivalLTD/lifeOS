import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Password sign-in via plain HTML form POST — no client JS required.
 * On failure, redirects back to /login with a generic error flag (no
 * credential detail leaks).
 */
export async function POST(request: Request) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? request.url;
  const redirectTo = (path: string) =>
    NextResponse.redirect(new URL(path, base), { status: 303 });

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

