import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Resolves the signed-in owner or redirects to /login.
 * getUser() revalidates the JWT against the auth server — required because
 * server-side Drizzle queries bypass RLS and rely on explicit user scoping.
 */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}
