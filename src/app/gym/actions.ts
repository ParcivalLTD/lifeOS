"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  addSet,
  archiveSession,
  archiveTemplate,
  createTemplate,
  endSession,
  logSet,
  startSessionFromTemplate,
  updateTemplate,
} from "@/lib/data/gym";
import { isValidISODate, todayISO } from "@/lib/dates";
import type { GymSetLog } from "@/db/schema";
import type { TemplateExercise } from "@/lib/gym";

const revalidateGym = () => {
  revalidatePath("/gym");
  revalidatePath("/"); // dashboard workout card in a later phase
};

const clampInt = (v: unknown, min: number, max: number, dflt: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};
const clampNum = (v: unknown, min: number, max: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};
const okId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;

function parseTemplateExercises(raw: string): TemplateExercise[] | null {
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(arr)) return null;
  const out = arr
    .map((e): TemplateExercise => {
      const rec = e as Record<string, unknown>;
      const hasKg = rec.targetKg != null && rec.targetKg !== "";
      return {
        name: String(rec.name ?? "").trim().slice(0, 100),
        targetSets: clampInt(rec.targetSets, 1, 20, 3),
        targetReps: clampInt(rec.targetReps, 1, 100, 8),
        targetKg: hasKg ? clampNum(rec.targetKg, 0, 1000) : undefined,
      };
    })
    .filter((e) => e.name.length > 0);
  return out.length > 0 ? out : null;
}

// --- templates (FR-GYM.1) ----------------------------------------------------

export async function createTemplateAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim().slice(0, 100);
  const exercises = parseTemplateExercises(String(formData.get("exercises") ?? ""));
  if (!name || !exercises) return;
  await createTemplate(user.id, { name, exercises });
  revalidateGym();
  redirect("/gym");
}

export async function updateTemplateAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 100);
  const exercises = parseTemplateExercises(String(formData.get("exercises") ?? ""));
  if (!okId(id) || !name || !exercises) return;
  await updateTemplate(user.id, id, { name, exercises });
  revalidateGym();
  redirect("/gym");
}

export async function archiveTemplateAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!okId(id)) return;
  await archiveTemplate(user.id, id);
  revalidateGym();
  redirect("/gym");
}

// --- sessions (FR-GYM.2) -----------------------------------------------------

export async function startSessionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const templateId = String(formData.get("templateId") ?? "");
  const dateRaw = String(formData.get("date") ?? "");
  if (!okId(templateId)) return;
  const date = isValidISODate(dateRaw) ? dateRaw : todayISO();
  const session = await startSessionFromTemplate(user.id, templateId, date);
  revalidateGym();
  if (session) redirect(`/gym?session=${session.id}`);
}

/** Fast path (sub-10s capture): toggle/adjust one set. Called imperatively. */
export async function logSetAction(
  sessionId: string,
  exerciseIdx: number,
  setIdx: number,
  patch: { kg?: number; reps?: number; done?: boolean },
): Promise<void> {
  const user = await requireUser();
  if (!okId(sessionId)) return;
  if (!Number.isInteger(exerciseIdx) || !Number.isInteger(setIdx)) return;
  if (exerciseIdx < 0 || setIdx < 0 || exerciseIdx > 50 || setIdx > 50) return;

  const clean: Partial<GymSetLog> = {};
  if (patch.done != null) clean.done = Boolean(patch.done);
  if (patch.kg != null) clean.kg = clampNum(patch.kg, 0, 1000);
  if (patch.reps != null) clean.reps = clampInt(patch.reps, 0, 100, 0);

  await logSet(user.id, sessionId, exerciseIdx, setIdx, clean);
  revalidateGym();
}

export async function addSetAction(sessionId: string, exerciseIdx: number): Promise<void> {
  const user = await requireUser();
  if (!okId(sessionId) || !Number.isInteger(exerciseIdx) || exerciseIdx < 0) return;
  await addSet(user.id, sessionId, exerciseIdx);
  revalidateGym();
}

export async function archiveSessionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!okId(id)) return;
  await archiveSession(user.id, id);
  revalidateGym();
  redirect("/gym");
}

export async function endSessionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!okId(id)) return;
  await endSession(user.id, id);
  revalidateGym();
  redirect("/gym?view=stats");
}
