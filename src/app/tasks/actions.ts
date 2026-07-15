"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  archiveTask,
  createTask,
  getTask,
  setTaskStatus,
  updateTask,
} from "@/lib/data/tasks";
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
  revalidatePath("/");
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
  revalidatePath("/");
}

export async function updateTaskAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id || id.length > 64) return;

  const title = String(formData.get("title") ?? "").trim().slice(0, 500);
  if (!title) return;

  const notesRaw = String(formData.get("notes") ?? "").trim().slice(0, 5000);
  const domainRaw = String(formData.get("domain") ?? "personal");
  const dueRaw = String(formData.get("due") ?? "");
  const priorityRaw = Number(formData.get("priority"));
  const repeat = String(formData.get("repeat") ?? "__keep");
  const dueDate = isValidISODate(dueRaw) ? dueRaw : null;

  // "__keep" preserves the stored rule verbatim (incl. rules the preset
  // select can't express); anything else replaces or clears it.
  let recurrence: string | null;
  if (repeat === "__keep") {
    const current = await getTask(user.id, id);
    if (!current) return;
    recurrence = current.recurrence;
  } else {
    recurrence = repeatToRule(repeat, dueDate);
  }

  await updateTask(user.id, id, {
    title,
    notes: notesRaw || null,
    domain: isDomain(domainRaw) ? domainRaw : "personal",
    dueDate,
    priority: [1, 2, 3].includes(priorityRaw) ? priorityRaw : 2,
    recurrence,
  });
  revalidatePath("/tasks");
  revalidatePath("/");
  redirect("/tasks");
}

export async function archiveTaskAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id || id.length > 64) return;

  await archiveTask(user.id, id);
  revalidatePath("/tasks");
  revalidatePath("/");
  redirect("/tasks");
}
