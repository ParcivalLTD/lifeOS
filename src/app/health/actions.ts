"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { isManualHealthKey, logHealthDatapoint } from "@/lib/data/health";
import { isValidISODate, todayISO } from "@/lib/dates";

/** Manual quick-log (FR-HLTH.1): weight or sleep hours as a native datapoint. */
export async function logHealthMetricAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const key = String(formData.get("key") ?? "");
  if (!isManualHealthKey(key)) return;

  const value = Number(formData.get("value"));
  if (!Number.isFinite(value) || value <= 0) return;
  // sanity caps, not medical judgements: kg for weight, hours for sleep
  if (key === "weight" && value > 500) return;
  if (key === "sleepHours" && value > 24) return;

  const rawDate = String(formData.get("date") ?? "");
  const dateISO = isValidISODate(rawDate) ? rawDate : todayISO();

  await logHealthDatapoint(user.id, key, value, dateISO);
  revalidatePath("/health");
}
