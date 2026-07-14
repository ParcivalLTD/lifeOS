/**
 * Creates the single owner account via the Supabase admin API — the only way
 * accounts come into existence, since public sign-up is disabled (spec NG1).
 *
 * Requires in env (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   OWNER_EMAIL, OWNER_PASSWORD
 *
 * Usage: npm run auth:create-owner
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.OWNER_EMAIL;
  const password = process.env.OWNER_PASSWORD;

  if (!url || !serviceKey || !email || !password) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_EMAIL and OWNER_PASSWORD in .env.local",
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    if (error.code === "email_exists") {
      const { data: list, error: listError } =
        await admin.auth.admin.listUsers();
      if (listError) throw listError;
      const existing = list.users.find((u) => u.email === email);
      console.log(`owner already exists: ${existing?.id}`);
      console.log("set SEED_USER_ID to this id before running db:seed");
      return;
    }
    throw error;
  }

  console.log(`owner created: ${data.user.id}`);
  console.log("set SEED_USER_ID to this id before running db:seed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
