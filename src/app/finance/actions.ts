"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  archiveAccount,
  archiveBill,
  archiveBudget,
  archiveSavings,
  createAccount,
  createBill,
  createExpense,
  createSavings,
  generateBillOccurrence,
  updateAccount,
  updateBill,
  updateSavings,
  upsertBudget,
} from "@/lib/data/finance";
import { setSavingsFundsGoal } from "@/lib/data/goals";
import { isValidISODate, todayISO } from "@/lib/dates";

const revalidateFinance = () => {
  revalidatePath("/finance");
  revalidatePath("/calendar"); // generated bills land on the calendar
  revalidatePath("/");
};

const num = (v: unknown, min = 0, max = 1e9): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0;
};
const okId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;
const str = (v: unknown, max = 100): string => String(v ?? "").trim().slice(0, max);

// --- expense capture (FR-FIN.2 — the fastest flow in the app) ----------------

/**
 * Logs an expense from just an amount + category (description/date optional),
 * so capture is a single tap after typing the amount. Called imperatively for
 * an optimistic client; a positive amount is the only requirement.
 */
export async function logExpenseAction(input: {
  amount: number;
  category: string;
  description?: string;
  date?: string;
}): Promise<void> {
  const user = await requireUser();
  const amount = num(input.amount, 0.01, 1e7);
  const category = str(input.category, 40) || "Other";
  if (amount <= 0) return;
  await createExpense(user.id, {
    amount,
    category,
    description: str(input.description, 120) || undefined,
    dateISO: isValidISODate(input.date ?? "") ? input.date : todayISO(),
  });
  revalidateFinance();
}

// --- accounts (FR-FIN.1) -----------------------------------------------------

export async function saveAccountAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = str(formData.get("id"), 64);
  const name = str(formData.get("name"));
  const balance = num(formData.get("balance"), -1e9, 1e9);
  if (!name) return;
  if (okId(id)) await updateAccount(user.id, id, { name, balance });
  else await createAccount(user.id, { name, balance });
  revalidateFinance();
  redirect("/finance");
}

export async function archiveAccountAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = str(formData.get("id"), 64);
  if (!okId(id)) return;
  await archiveAccount(user.id, id);
  revalidateFinance();
  redirect("/finance");
}

// --- budgets (FR-FIN.2) ------------------------------------------------------

export async function upsertBudgetAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const category = str(formData.get("category"), 40);
  const cap = num(formData.get("cap"), 0, 1e7);
  if (!category) return;
  await upsertBudget(user.id, category, cap);
  revalidateFinance();
  redirect("/finance");
}

export async function archiveBudgetAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = str(formData.get("id"), 64);
  if (!okId(id)) return;
  await archiveBudget(user.id, id);
  revalidateFinance();
  redirect("/finance");
}

// --- savings goals (FR-FIN.3) ------------------------------------------------

export async function saveSavingsAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = str(formData.get("id"), 64);
  const name = str(formData.get("name"));
  const target = num(formData.get("target"), 0, 1e9);
  const current = num(formData.get("current"), 0, 1e9);
  const fundsGoalId = str(formData.get("fundsGoalId"), 64);
  if (!name || target <= 0) return;

  let savingsId = id;
  if (okId(id)) await updateSavings(user.id, id, { name, target, current });
  else savingsId = await createSavings(user.id, { name, target, current });

  // funds→ life-goal Link (FR-FIN.3 finished by the goal engine)
  if (okId(savingsId)) {
    await setSavingsFundsGoal(user.id, savingsId, okId(fundsGoalId) ? fundsGoalId : null);
  }
  revalidateFinance();
  redirect("/finance");
}

export async function archiveSavingsAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = str(formData.get("id"), 64);
  if (!okId(id)) return;
  await archiveSavings(user.id, id);
  revalidateFinance();
  redirect("/finance");
}

// --- bills (FR-FIN.4) --------------------------------------------------------

const REPEAT_TO_RULE: Record<string, string> = {
  weekly: "FREQ=WEEKLY",
  monthly: "FREQ=MONTHLY",
  yearly: "FREQ=YEARLY",
};

export async function saveBillAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = str(formData.get("id"), 64);
  const name = str(formData.get("name"));
  const amount = num(formData.get("amount"), 0, 1e7);
  const category = str(formData.get("category"), 40) || "Subscriptions";
  const recurrence = REPEAT_TO_RULE[str(formData.get("repeat"), 12)] ?? "FREQ=MONTHLY";
  const nextDueRaw = str(formData.get("nextDue"), 10);
  const nextDue = isValidISODate(nextDueRaw) ? nextDueRaw : todayISO();
  if (!name || amount <= 0) return;
  if (okId(id)) await updateBill(user.id, id, { name, amount, category, recurrence, nextDue });
  else await createBill(user.id, { name, amount, category, recurrence, nextDue });
  revalidateFinance();
  redirect("/finance");
}

export async function generateBillAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = str(formData.get("id"), 64);
  if (!okId(id)) return;
  await generateBillOccurrence(user.id, id);
  revalidateFinance();
}

export async function archiveBillAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = str(formData.get("id"), 64);
  if (!okId(id)) return;
  await archiveBill(user.id, id);
  revalidateFinance();
  redirect("/finance");
}
