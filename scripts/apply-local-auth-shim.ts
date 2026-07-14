/**
 * Applies scripts/local-auth-shim.sql to DATABASE_URL.
 * Only for plain local Postgres — never needed (or wanted) on Supabase.
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const shimPath = join(dirname(fileURLToPath(import.meta.url)), "local-auth-shim.sql");
  const shimSql = readFileSync(shimPath, "utf8");

  const client = postgres(url, { max: 1 });
  try {
    await client.unsafe(shimSql);
    console.log("local auth shim applied (auth.uid() + anon/authenticated/service_role roles)");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
