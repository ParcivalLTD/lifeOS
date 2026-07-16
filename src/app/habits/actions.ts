"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { HabitSchedule } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import {
  archiveHabit,
  createHabit,
  setHabitCompletion,
  updateHabit,
} from "@/lib/data/habits";
import { daysBetween, isValidISODate, todayISO } from "@/lib/dates";
import { isDomain } from "@/lib/domains";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayKey = (typeof DAY_KEYS)[number];

/** Shared parse for the add + edit forms; "__keep" (edit only) → null. */
function parseSchedule(formData: FormData): HabitSchedule | null | "invalid" {
  const type = String(formData.get("scheduleType") ?? "daily");
  if (type === "__keep") return null;
  if (type === "days") {
    const days = String(formData.get("days") ?? "")
      .split(",")
      .filter((d): d is DayKey => (DAY_KEYS as readonly string[]).includes(d));
    if (days.length === 0) return "invalid";
    return { type: "weekly_days", days };
  }
  if (type === "times") {
    const times = Math.min(7, Math.max(1, Number(formData.get("times")) || 3));
    return { type: "times_per_week", times };
  }
  return { type: "daily" };
}

export async function addHabitAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const title = String(formData.get("title") ?? "").trim().slice(0, 500);
  if (!title) return;

  const domainRaw = String(formData.get("domain") ?? "personal");
  const schedule = parseSchedule(formData);
  if (schedule === "invalid" || schedule === null) return; // add form has no "__keep"

  await createHabit(user.id, {
    title,
    domain: isDomain(domainRaw) ? domainRaw : "personal",
    schedule,
  });
  revalidatePath("/habits");
  revalidatePath("/");
}

export async function updateHabitAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id || id.length > 64) return;

  const title = String(formData.get("title") ?? "").trim().slice(0, 500);
  if (!title) return;

  const domainRaw = String(formData.get("domain") ?? "personal");
  const schedule = parseSchedule(formData);
  if (schedule === "invalid") return;

  await updateHabit(user.id, id, {
    title,
    domain: isDomain(domainRaw) ? domainRaw : "personal",
    schedule,
    today: todayISO(),
  });
  revalidatePath("/habits");
  revalidatePath("/");
  redirect("/habits");
}

/** Swipe-to-delete from the list: archive without leaving the page. */
export async function archiveHabitInlineAction(habitId: string): Promise<void> {
  const user = await requireUser();
  if (typeof habitId !== "string" || !habitId || habitId.length > 64) return;
  await archiveHabit(user.id, habitId);
  revalidatePath("/habits");
  revalidatePath("/");
}

export async function archiveHabitAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id || id.length > 64) return;

  await archiveHabit(user.id, id);
  revalidatePath("/habits");
  revalidatePath("/");
  redirect("/habits");
}

export async function toggleHabitAction(
  habitId: string,
  dateISO: string,
  done: boolean,
): Promise<void> {
  const user = await requireUser();
  if (typeof habitId !== "string" || habitId.length > 64) return;
  // client sends its local date; allow small clock skew, nothing else
  if (!isValidISODate(dateISO) || Math.abs(daysBetween(todayISO(), dateISO)) > 2) {
    return;
  }

  await setHabitCompletion(user.id, habitId, dateISO, done);
  revalidatePath("/habits");
  revalidatePath("/");
}
