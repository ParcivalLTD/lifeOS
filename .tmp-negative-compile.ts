/**
 * Negative compile test — every statement below MUST be a TypeScript error.
 * Run: npx tsc --noEmit  (expect exactly these failures, then delete file)
 */
import { pgTable, text, uuid } from "drizzle-orm/pg-core";
// @ts-expect-error — raw db is module-private; unscoped queries are impossible
import { db } from "@/db";
import { forUser } from "@/db";
import { tasks } from "@/db/schema";

const udb = forUser("00000000-0000-0000-0000-000000000001");

// a table WITHOUT a user_id column is not accepted by the scoped wrapper
const notScoped = pgTable("not_scoped", {
  id: uuid("id").primaryKey(),
  name: text("name"),
});
// @ts-expect-error — table lacks userId; wrapper refuses it
void udb.select(notScoped);

// inserts cannot smuggle a different user_id — the key does not exist on input
void udb.insert(tasks, {
  title: "x",
  domain: "personal",
  // @ts-expect-error — userId is stripped from the insert shape
  userId: "attacker-id",
});

// updates cannot rewrite user_id either
// @ts-expect-error — userId is not an updatable key
void udb.update(tasks, { userId: "attacker-id" });
