"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  archiveAssessment,
  archiveCourse,
  createAssessment,
  createCourse,
  logStudySession,
  setGrade,
  updateCourse,
} from "@/lib/data/academic";
import { requireUser } from "@/lib/auth";
import { isValidISODate, todayISO } from "@/lib/dates";

const str = (fd: FormData, k: string): string => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string): number | null => {
  const raw = str(fd, k);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};
const pct = (fd: FormData, k: string): number | null => {
  const n = num(fd, k);
  return n == null ? null : Math.min(Math.max(n, 0), 100);
};

const revalidate = () => {
  revalidatePath("/academic");
  revalidatePath("/calendar"); // assessments + study sessions are calendar events
  revalidatePath("/");
};

export async function addCourseAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const code = str(formData, "code");
  const name = str(formData, "name");
  if (!code || !name) return;
  await createCourse(user.id, {
    code,
    name,
    semester: str(formData, "semester") || null,
    targetGrade: pct(formData, "targetGrade"),
    plannedHours: num(formData, "plannedHours"),
  });
  revalidate();
}

export async function updateCourseAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = str(formData, "id");
  const code = str(formData, "code");
  const name = str(formData, "name");
  if (!id || !code || !name) return;
  await updateCourse(user.id, id, {
    code,
    name,
    semester: str(formData, "semester") || null,
    targetGrade: pct(formData, "targetGrade"),
    plannedHours: num(formData, "plannedHours"),
    goalId: str(formData, "goalId") || null,
  });
  revalidate();
  redirect("/academic");
}

export async function archiveCourseAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = str(formData, "id");
  if (!id) return;
  await archiveCourse(user.id, id);
  revalidate();
  redirect("/academic");
}

export async function addAssessmentAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const courseId = str(formData, "courseId");
  const name = str(formData, "name");
  const due = str(formData, "due");
  if (!courseId || !name || !isValidISODate(due)) return;
  await createAssessment(user.id, {
    courseId,
    name,
    weight: pct(formData, "weight"),
    dueISO: due,
  });
  revalidate();
}

export async function gradeAssessmentAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = str(formData, "id");
  if (!id) return;
  await setGrade(user.id, id, pct(formData, "grade"));
  revalidate();
}

export async function archiveAssessmentAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = str(formData, "id");
  if (!id) return;
  await archiveAssessment(user.id, id);
  revalidate();
}

export async function logStudyAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const courseId = str(formData, "courseId");
  const hours = num(formData, "hours");
  if (!courseId || hours == null || hours <= 0) return;
  const date = str(formData, "date");
  await logStudySession(user.id, {
    courseId,
    hours,
    dateISO: isValidISODate(date) ? date : todayISO(),
  });
  revalidate();
}
