"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { archiveEvent, createEvent, updateEvent } from "@/lib/data/events";
import { isValidISODate, todayISO } from "@/lib/dates";
import { isDomain } from "@/lib/domains";
import { isEventKind, isValidHM } from "@/lib/event-utils";
import type { EventInput } from "@/lib/data/events";

function parseEventForm(formData: FormData): EventInput | null {
  const title = String(formData.get("title") ?? "").trim().slice(0, 500);
  if (!title) return null;

  const domainRaw = String(formData.get("domain") ?? "personal");
  const kindRaw = String(formData.get("kind") ?? "appointment");
  const dateRaw = String(formData.get("date") ?? "");
  const timeRaw = String(formData.get("time") ?? "").trim();
  const endRaw = String(formData.get("end") ?? "").trim();

  return {
    title,
    domain: isDomain(domainRaw) ? domainRaw : "personal",
    kind: isEventKind(kindRaw) ? kindRaw : "appointment",
    dateISO: isValidISODate(dateRaw) ? dateRaw : todayISO(),
    timeHM: isValidHM(timeRaw) ? timeRaw : null,
    endHM: isValidHM(endRaw) ? endRaw : null,
  };
}

/** Calendar quick-add: stays on the calendar, fields reset on completion. */
export async function createEventAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const input = parseEventForm(formData);
  if (!input) return;

  await createEvent(user.id, input);
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function updateEventAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id || id.length > 64) return;
  const input = parseEventForm(formData);
  if (!input) return;

  await updateEvent(user.id, id, input);
  revalidatePath("/calendar");
  revalidatePath("/");
  redirect(`/calendar?view=day&date=${input.dateISO}`);
}

export async function deleteEventAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const backDate = String(formData.get("date") ?? todayISO());
  if (!id || id.length > 64) return;

  await archiveEvent(user.id, id);
  revalidatePath("/calendar");
  revalidatePath("/");
  redirect(
    `/calendar?view=day&date=${isValidISODate(backDate) ? backDate : todayISO()}`,
  );
}
