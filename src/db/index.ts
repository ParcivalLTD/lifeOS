/**
 * Data access. Server-side Drizzle connects as `postgres` and BYPASSES RLS
 * (CLAUDE.md rule), so the raw client is module-private: every feature query
 * must go through `forUser(userId)`, which injects the user_id filter into
 * each statement. Forgetting the filter is a compile error — there is no
 * exported handle that can query a user-scoped table unscoped.
 *
 * The single sanctioned exception is `fullExportDb()` for NFR-4 whole-
 * database backups.
 */
import { and, eq, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
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
const pgClient = globalForDb.pgClient ?? postgres(url, { prepare: false });
if (process.env.NODE_ENV !== "production") {
  globalForDb.pgClient = pgClient;
}

const db = drizzle(pgClient, { schema });

export type Db = typeof db;

/** Any table carrying a user_id column (every core + conversation table). */
export type UserScopedTable = PgTable & { userId: PgColumn };

type Row<T extends UserScopedTable> = T["$inferSelect"];
/** Insert shape with userId stripped — the wrapper supplies it. */
type NewRow<T extends UserScopedTable> = Omit<T["$inferInsert"], "userId">;

/**
 * All queries issued through this wrapper are ANDed with
 * `table.user_id = <userId>`; inserts get userId injected (and cannot
 * override it — `userId` is not an accepted input key).
 */
export class UserDb {
  constructor(readonly userId: string) {
    if (!userId) throw new Error("forUser() requires a user id");
  }

  private scope(table: UserScopedTable, where?: SQL): SQL {
    const owned = eq(table.userId, this.userId);
    return where ? and(owned, where)! : owned;
  }

  async select<T extends UserScopedTable>(
    table: T,
    opts: { where?: SQL; orderBy?: (PgColumn | SQL)[] } = {},
  ): Promise<Row<T>[]> {
    const q = db
      .select()
      .from(table as PgTable)
      .where(this.scope(table, opts.where));
    const rows = opts.orderBy?.length ? await q.orderBy(...opts.orderBy) : await q;
    return rows as Row<T>[];
  }

  async insert<T extends UserScopedTable>(
    table: T,
    values: NewRow<T> | NewRow<T>[],
    opts?: {
      onConflict?: { target: PgColumn[]; set: Partial<NewRow<T>> };
    },
  ): Promise<Row<T>[]> {
    const list = (Array.isArray(values) ? values : [values]).map((v) => ({
      ...v,
      userId: this.userId,
    }));
    const q = db.insert(table).values(list as T["$inferInsert"][]);
    if (opts?.onConflict) {
      return (await q
        .onConflictDoUpdate({
          target: opts.onConflict.target,
          set: opts.onConflict.set as never,
        })
        .returning()) as Row<T>[];
    }
    return (await q.returning()) as Row<T>[];
  }

  async update<T extends UserScopedTable>(
    table: T,
    set: Partial<NewRow<T>>,
    where?: SQL,
  ): Promise<void> {
    await db
      .update(table)
      .set(set as never)
      .where(this.scope(table, where));
  }

  async delete<T extends UserScopedTable>(
    table: T,
    where?: SQL,
  ): Promise<void> {
    await db.delete(table).where(this.scope(table, where));
  }
}

/** The only query surface for user-scoped tables. */
export const forUser = (userId: string): UserDb => new UserDb(userId);

/**
 * Unscoped, whole-database access. Single-tenant full export ONLY (NFR-4
 * backups in src/lib/backup.ts). Any other use is a bug per the CLAUDE.md
 * RLS-bypass rule.
 */
export function fullExportDb(reason: "nfr4-full-export"): Db {
  void reason;
  return db;
}

/** For scripts/tests only: closes the shared connection so the process exits. */
export async function closeDb(): Promise<void> {
  await pgClient.end();
}
