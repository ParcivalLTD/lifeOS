"use server";

import { revalidatePath } from "next/cache";
import { saveReview } from "@/lib/data/review";
import { requireUser } from "@/lib/auth";
import type { ReviewType } from "@/lib/review";

const str = (fd: FormData, k: string): string => String(fd.get(k) ?? "").trim();

const isReviewType = (v: string): v is ReviewType =>
  v === "weekly" || v === "monthly" || v === "quarterly";

/**
 * Completes (or re-completes — same period replaces) a review. The snapshot
 * itself is recomputed server-side at save time; the client only contributes
 * the reflections.
 */
export async function saveReviewAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const type = str(formData, "type");
  if (!isReviewType(type)) return;
  const reflections: Record<string, string> = {};
  const keys =
    type === "weekly" ? ["worked", "didnt", "top3"] : ["moved", "adjust"];
  for (const k of keys) {
    const v = str(formData, k);
    if (v) reflections[k] = v;
  }
  await saveReview(user.id, type, reflections);
  revalidatePath("/review");
}
