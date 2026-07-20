/**
 * NFR-4 durability: full-database export of every core entity as one JSON
 * document, plus upload into the private `backups` Storage bucket.
 * Single-tenant, so the dump is unfiltered — it captures the whole schema.
 */
import { fullExportDb } from "@/db";
import {
  conversationMessages,
  conversations,
  events,
  goals,
  habitCompletions,
  habits,
  journalEntries,
  links,
  metricDatapoints,
  metrics,
  tasks,
} from "@/db/schema";
import { createAdminClient } from "@/lib/supabase/admin";

const TABLES = {
  goals,
  tasks,
  habits,
  habit_completions: habitCompletions,
  events,
  metrics,
  metric_datapoints: metricDatapoints,
  journal_entries: journalEntries,
  links,
  // assistant history — the owner's own transcripts leave with their data too
  conversations,
  conversation_messages: conversationMessages,
} as const;

export type BackupDocument = {
  version: 1;
  generatedAt: string;
  counts: Record<keyof typeof TABLES, number>;
  data: Record<keyof typeof TABLES, unknown[]>;
};

export async function buildExport(): Promise<BackupDocument> {
  // Deliberately unscoped: single-tenant whole-database dump (NFR-4).
  const db = fullExportDb("nfr4-full-export");
  const names = Object.keys(TABLES) as (keyof typeof TABLES)[];
  const results = await Promise.all(
    names.map((name) => db.select().from(TABLES[name])),
  );

  const data = {} as BackupDocument["data"];
  const counts = {} as BackupDocument["counts"];
  names.forEach((name, i) => {
    data[name] = results[i];
    counts[name] = results[i].length;
  });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    counts,
    data,
  };
}

export const BACKUP_BUCKET = "backups";

async function ensureBucket(admin: ReturnType<typeof createAdminClient>) {
  const { error } = await admin.storage.createBucket(BACKUP_BUCKET, {
    public: false,
  });
  if (error && !/already exists/i.test(error.message)) throw error;
}

/** Uploads one dump as helm-backup-<timestamp>.json; returns path + size. */
export async function uploadBackup(
  dump: BackupDocument,
): Promise<{ path: string; bytes: number }> {
  const admin = createAdminClient();
  await ensureBucket(admin);

  const stamp = dump.generatedAt.replace(/[:]/g, "-").slice(0, 16); // YYYY-MM-DDTHH-mm
  const path = `helm-backup-${stamp}.json`;
  const body = JSON.stringify(dump);

  const { error } = await admin.storage
    .from(BACKUP_BUCKET)
    .upload(path, new Blob([body], { type: "application/json" }), {
      contentType: "application/json",
      upsert: true,
    });
  if (error) throw error;

  return { path, bytes: Buffer.byteLength(body) };
}

export type BackupFileInfo = { name: string; bytes: number; createdAt: string };

/** Most recent backups in the bucket (for the settings page). */
export async function listBackups(limit = 8): Promise<BackupFileInfo[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BACKUP_BUCKET).list("", {
    limit,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) {
    if (/not found/i.test(error.message)) return []; // bucket not created yet
    throw error;
  }
  return (data ?? [])
    .filter((f) => f.name.endsWith(".json"))
    .map((f) => ({
      name: f.name,
      bytes: (f.metadata as { size?: number } | null)?.size ?? 0,
      createdAt: f.created_at ?? "",
    }));
}
