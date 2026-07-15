"use server";

import { revalidatePath } from "next/cache";
import type { HabitSchedule } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { createHabit, setHabitCompletion } from "@/lib/data/habits";
import { daysBetween, isValidISODate, todayISO } from "@/lib/dates";
import { isDomain } from "@/lib/domains";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayKey = (typeof DAY_KEYS)[number];

export async function addHabitAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const title = String(formData.get("title") ?? "").trim().slice(0, 500);
  if (!title) return;

  const domainRaw = String(formData.get("domain") ?? "personal");
  const type = String(formData.get("scheduleType") ?? "daily");

  let schedule: HabitSchedule = { type: "daily" };
  if (type === "days") {
    const days = String(formData.get("days") ?? "")
      .split(",")
      .filter((d): d is DayKey => (DAY_KEYS as readonly string[]).includes(d));
    if (days.length === 0) return;
    schedule = { type: "weekly_days", days };
  } else if (type === "times") {
    const times = Math.min(7, Math.max(1, Number(formData.get("times")) || 3));
    schedule = { type: "times_per_week", times };
  }

  await createHabit(user.id, {
    title,
    domain: isDomain(domainRaw) ? domainRaw : "personal",
    schedule,
  });
  revalidatePath("/habits");
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
}
