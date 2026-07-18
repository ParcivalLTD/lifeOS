"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addAchievement,
  archiveAchievement,
  archiveProject,
  createProject,
  logProjectTime,
  toggleTimer,
  updateProject,
} from "@/lib/data/work";
import { requireUser } from "@/lib/auth";
import { isValidISODate, todayISO } from "@/lib/dates";

const str = (fd: FormData, k: string): string => String(fd.get(k) ?? "").trim();

const revalidate = () => {
  revalidatePath("/work");
  revalidatePath("/calendar"); // project deadlines are calendar events
  revalidatePath("/");
};

export async function addProjectAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const title = str(formData, "title");
  const due = str(formData, "due");
  if (!title || !isValidISODate(due)) return;
  await createProject(user.id, { title, dueISO: due });
  revalidate();
}

export async function updateProjectAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = str(formData, "id");
  const title = str(formData, "title");
  const due = str(formData, "due");
  if (!id || !title || !isValidISODate(due)) return;
  await updateProject(user.id, id, {
    title,
    dueISO: due,
    goalId: str(formData, "goalId") || null,
  });
  revalidate();
  redirect("/work");
}

export async function archiveProjectAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = str(formData, "id");
  if (!id) return;
  await archiveProject(user.id, id);
  revalidate();
  redirect("/work");
}

/** Quick-duration tap (FR-WORK.4): one button = one entry, no other fields. */
export async function logTimeAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = str(formData, "projectId");
  const hours = Number(str(formData, "hours"));
  if (!id || !Number.isFinite(hours) || hours <= 0) return;
  await logProjectTime(user.id, id, hours);
  revalidate();
}

/** Start/stop timer — running state lives on the project Event. */
export async function toggleTimerAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = str(formData, "projectId");
  if (!id) return;
  await toggleTimer(user.id, id);
  revalidate();
}

export async function addAchievementAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const title = str(formData, "title");
  if (!title) return;
  const date = str(formData, "date");
  await addAchievement(user.id, {
    title,
    context: str(formData, "context") || null,
    dateISO: isValidISODate(date) ? date : todayISO(),
  });
  revalidate();
}

export async function archiveAchievementAction(id: string): Promise<void> {
  const user = await requireUser();
  if (!id) return;
  await archiveAchievement(user.id, id);
  revalidate();
}
