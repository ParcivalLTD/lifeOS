"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  archiveGoal,
  createGoal,
  createGoalLink,
  deleteLink,
  linkMetricToGoal,
  setHabitGoal,
  updateGoal,
  type GoalInput,
} from "@/lib/data/goals";
import { isValidISODate } from "@/lib/dates";
import { isDomain, type Domain } from "@/lib/domains";
import { HORIZONS, type Horizon } from "@/lib/goals";

const revalidateGoals = (id?: string) => {
  revalidatePath("/goals");
  revalidatePath("/");
  if (id) revalidatePath(`/goals/${id}`);
};

const str = (v: unknown, max = 500): string => String(v ?? "").trim().slice(0, max);
const okId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;

const STATUSES = ["active", "achieved", "abandoned", "paused"] as const;

function parseGoalForm(formData: FormData): GoalInput | null {
  const title = str(formData.get("title"), 200);
  if (!title) return null;
  const domainRaw = str(formData.get("domain"), 20);
  const horizonRaw = str(formData.get("horizon"), 12) as Horizon;
  const parentRaw = str(formData.get("parentGoalId"), 64);
  const dueRaw = str(formData.get("targetDate"), 10);
  const statusRaw = str(formData.get("status"), 12) as GoalInput["status"];
  return {
    title,
    description: str(formData.get("description"), 2000) || null,
    domain: isDomain(domainRaw) ? domainRaw : "personal",
    horizon: HORIZONS.includes(horizonRaw) ? horizonRaw : "yearly",
    parentGoalId: okId(parentRaw) ? parentRaw : null,
    targetDate: isValidISODate(dueRaw) ? dueRaw : null,
    successCriteria: str(formData.get("successCriteria"), 500) || null,
    status: (STATUSES as readonly string[]).includes(statusRaw) ? statusRaw : "active",
  };
}

export async function createGoalAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const input = parseGoalForm(formData);
  if (!input) return;
  const id = await createGoal(user.id, input);
  revalidateGoals(id);
  redirect(`/goals/${id}`);
}

export async function updateGoalAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = str(formData.get("id"), 64);
  const input = parseGoalForm(formData);
  if (!okId(id) || !input) return;
  // guard against self-parenting
  if (input.parentGoalId === id) input.parentGoalId = null;
  await updateGoal(user.id, id, input);
  revalidateGoals(id);
  redirect(`/goals/${id}`);
}

export async function archiveGoalAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = str(formData.get("id"), 64);
  if (!okId(id)) return;
  await archiveGoal(user.id, id);
  revalidateGoals();
  redirect("/goals");
}

// --- linking (FR-GOAL.1 / FR-GOAL.4) -----------------------------------------

export async function attachHabitAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const goalId = str(formData.get("goalId"), 64);
  const habitId = str(formData.get("habitId"), 64);
  if (!okId(goalId) || !okId(habitId)) return;
  await setHabitGoal(user.id, habitId, goalId);
  revalidateGoals(goalId);
  redirect(`/goals/${goalId}`);
}

export async function detachHabitAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const goalId = str(formData.get("goalId"), 64);
  const habitId = str(formData.get("habitId"), 64);
  if (!okId(habitId)) return;
  await setHabitGoal(user.id, habitId, null);
  revalidateGoals(goalId);
  redirect(`/goals/${goalId}`);
}

export async function linkMetricAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const goalId = str(formData.get("goalId"), 64);
  const metricId = str(formData.get("metricId"), 64);
  const domainRaw = str(formData.get("domain"), 20);
  if (!okId(goalId) || !okId(metricId)) return;
  await linkMetricToGoal(user.id, metricId, goalId, (isDomain(domainRaw) ? domainRaw : "personal") as Domain);
  revalidateGoals(goalId);
  redirect(`/goals/${goalId}`);
}

export async function linkGoalAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const fromId = str(formData.get("fromId"), 64);
  const toId = str(formData.get("toId"), 64);
  const relationRaw = str(formData.get("relation"), 12);
  const domainRaw = str(formData.get("domain"), 20);
  const relations = ["funds", "supports", "blocks", "relates-to"] as const;
  if (!okId(fromId) || !okId(toId)) return;
  if (!(relations as readonly string[]).includes(relationRaw)) return;
  await createGoalLink(user.id, {
    fromId,
    toId,
    relation: relationRaw as (typeof relations)[number],
    domain: (isDomain(domainRaw) ? domainRaw : "personal") as Domain,
  });
  revalidateGoals(fromId);
  redirect(`/goals/${fromId}`);
}

export async function deleteLinkAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const linkId = str(formData.get("linkId"), 64);
  const goalId = str(formData.get("goalId"), 64);
  if (!okId(linkId)) return;
  await deleteLink(user.id, linkId);
  revalidateGoals(goalId);
  redirect(`/goals/${goalId}`);
}
