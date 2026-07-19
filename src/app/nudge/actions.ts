"use server";

import { revalidatePath } from "next/cache";
import { aiConfigured } from "@/lib/ai/client";
import { generateNudgeText } from "@/lib/ai/nudge";
import { requireUser } from "@/lib/auth";
import {
  getNudgeEnabled,
  getTodayNudge,
  saveTodayNudge,
  setNudgeEnabled,
} from "@/lib/data/nudge";

export type NudgeResult =
  | { ok: true; text: string }
  | { ok: false; reason: "disabled" | "not-configured" | "error" };

/**
 * Return today's nudge, generating it on FIRST request of the day only.
 *
 * Cost guard (NFR-5): if today's nudge is already cached it is returned
 * WITHOUT touching the API; the API is called at most once per day, on the
 * first dashboard load after midnight. The dashboard build never calls this —
 * the banner does, client-side after render, so the dashboard stays fast.
 */
export async function generateDailyNudgeAction(): Promise<NudgeResult> {
  const user = await requireUser();
  if (!(await getNudgeEnabled(user.id))) return { ok: false, reason: "disabled" };

  const cached = await getTodayNudge(user.id);
  if (cached) return { ok: true, text: cached.text }; // cache hit — no API call

  if (!aiConfigured()) return { ok: false, reason: "not-configured" };

  try {
    const text = await generateNudgeText(user.id);
    if (!text) return { ok: false, reason: "error" };
    await saveTodayNudge(user.id, text);
    return { ok: true, text };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Enable/disable the daily nudge (Settings). */
export async function setNudgeEnabledAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const enabled = String(formData.get("enabled")) === "true";
  await setNudgeEnabled(user.id, enabled);
  revalidatePath("/");
  revalidatePath("/settings");
}
