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

/** Provider errors are verbose and often carry a JSON body; condense to
 * something that fits one dashboard line and still says what to fix. */
function shortReason(message: string): string {
  if (/credit balance is too low|billing|quota|insufficient_quota/i.test(message)) {
    return "the provider account is out of credit";
  }
  if (/rate.?limit|429/i.test(message)) return "the provider is rate-limiting";
  if (/api key|401|authentication/i.test(message)) return "the API key was rejected";
  return "the provider request failed";
}

export type NudgeResult =
  | { ok: true; text: string }
  | { ok: false; reason: "disabled" | "not-configured" | "error"; detail?: string };

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
    if (!text) {
      console.error("daily nudge: provider returned empty text");
      return { ok: false, reason: "error", detail: "the model returned nothing" };
    }
    await saveTodayNudge(user.id, text);
    return { ok: true, text };
  } catch (err) {
    // Never swallow this silently: a nudge that just doesn't appear is
    // indistinguishable from one that was never enabled. Log it server-side
    // and hand the banner a short reason to show.
    const detail = err instanceof Error ? err.message : "unknown error";
    console.error("daily nudge generation failed:", detail);
    return { ok: false, reason: "error", detail: shortReason(detail) };
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
