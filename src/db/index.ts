import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set");
}

// Reuse the connection across dev hot-reloads so HMR doesn't exhaust the pool.
const globalForDb = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
};

// prepare: false — required for Supabase's transaction-mode pooler.
export const pgClient = globalForDb.pgClient ?? postgres(url, { prepare: false });
if (process.env.NODE_ENV !== "production") {
  globalForDb.pgClient = pgClient;
}

export const db = drizzle(pgClient, { schema });
