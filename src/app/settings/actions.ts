"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { buildExport, uploadBackup } from "@/lib/backup";

/** Manual "back up to storage now" from the settings page. */
export async function runBackupAction(): Promise<void> {
  await requireUser();

  let outcome: string;
  try {
    const dump = await buildExport();
    const { path } = await uploadBackup(dump);
    outcome = `ok&path=${encodeURIComponent(path)}`;
  } catch (err) {
    console.error("manual backup failed:", err);
    outcome = "error";
  }
  redirect(`/settings?backup=${outcome}`);
}
