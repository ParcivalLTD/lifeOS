"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createTask, setTaskStatus } from "@/lib/data/tasks";
import { isValidISODate, weekdayOf } from "@/lib/dates";
import { isDomain } from "@/lib/domains";
import type { TaskStatus } from "@/lib/task-utils";

const BYDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Quick-add repeat select → RRULE. Weekly anchors to the due date's weekday. */
function repeatToRule(repeat: string, due: string | null): string | null {
  switch (repeat) {
    case "daily":
      return "FREQ=DAILY";
    case "weekly":
      return due ? `FREQ=WEEKLY;BYDAY=${BYDAY_CODES[weekdayOf(due)]}` : "FREQ=WEEKLY";
    case "monthly":
      return "FREQ=MONTHLY";
    case "yearly":
      return "FREQ=YEARLY";
    default:
      return null;
  }
}

export async function addTaskAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const title = String(formData.get("title") ?? "").trim().slice(0, 500);
  if (!title) return;

  const domainRaw = String(formData.get("domain") ?? "personal");
  const dueRaw = String(formData.get("due") ?? "");
  const priorityRaw = Number(formData.get("priority"));
  const dueDate = isValidISODate(dueRaw) ? dueRaw : null;

  await createTask(user.id, {
    title,
    domain: isDomain(domainRaw) ? domainRaw : "personal",
    dueDate,
    priority: [1, 2, 3].includes(priorityRaw) ? priorityRaw : 2,
    recurrence: repeatToRule(String(formData.get("repeat") ?? ""), dueDate),
  });
  revalidatePath("/tasks");
}

export async function setTaskStatusAction(
  taskId: string,
  status: TaskStatus,
): Promise<void> {
  const user = await requireUser();
  if (!["open", "done", "dropped"].includes(status)) return;
  if (typeof taskId !== "string" || taskId.length > 64) return;

  await setTaskStatus(user.id, taskId, status);
  revalidatePath("/tasks");
}
