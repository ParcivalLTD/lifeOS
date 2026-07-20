"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { buildExport, uploadBackup } from "@/lib/backup";
import { CalDavAuthError, verifyCredentials } from "@/lib/caldav/client";
import { syncAppleCalendar } from "@/lib/caldav/sync";
import { deleteConnection, saveConnection } from "@/lib/data/caldav";

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

/**
 * Connect (or reconnect) Apple Calendar.
 *
 * The credentials are VERIFIED against iCloud before being stored, so a typo
 * or an already-revoked password is reported here rather than silently
 * becoming a broken connection that only surfaces at the next poll.
 */
export async function connectAppleCalendarAction(
  form: FormData,
): Promise<{ error: string } | void> {
  const user = await requireUser();
  const appleId = String(form.get("appleId") ?? "").trim();
  const password = String(form.get("password") ?? "").trim();
  // A non-default host is test-only plumbing; it is never exposed in the UI.
  const baseUrl = process.env.CALDAV_BASE_URL || undefined;

  if (!appleId || !password) return { error: "Apple ID and app-specific password are required." };

  try {
    await verifyCredentials({ appleId, password, baseUrl });
  } catch (err) {
    if (err instanceof CalDavAuthError) {
      return {
        error:
          "iCloud rejected those details. Check the Apple ID, and make sure this is an app-specific password (not your Apple password).",
      };
    }
    return {
      error: err instanceof Error ? err.message : "Could not reach iCloud. Try again.",
    };
  }

  try {
    await saveConnection(user.id, { appleId, password, baseUrl });
  } catch (err) {
    // almost always a missing/!32-byte CALDAV_ENCRYPTION_KEY
    return { error: err instanceof Error ? err.message : "Could not store the credentials." };
  }

  revalidatePath("/settings");
}

/** "Sync now" — the same pass the scheduled task runs. */
export async function syncAppleCalendarAction(): Promise<{ message: string }> {
  const user = await requireUser();
  const result = await syncAppleCalendar(user.id);
  revalidatePath("/settings");
  if (!result.ok) {
    return {
      message:
        result.reason === "auth-failed"
          ? "iCloud rejected the stored password — reconnect below."
          : `Sync failed: ${result.message}`,
    };
  }
  const s = result.summary;
  return {
    message: `${s.created} created · ${s.updated} updated · ${s.errors} errors · ${s.calendars} calendars`,
  };
}

export async function disconnectAppleCalendarAction(): Promise<void> {
  const user = await requireUser();
  await deleteConnection(user.id);
  revalidatePath("/settings");
}
