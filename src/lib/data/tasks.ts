import { eq } from "drizzle-orm";
import { forUser } from "@/db";
import { tasks } from "@/db/schema";
import { todayISO } from "@/lib/dates";
import { nextDueISO } from "@/lib/recurrence";
import { sortTasks, type TaskItem, type TaskStatus } from "@/lib/task-utils";
import type { Domain } from "@/lib/domains";

const toItem = (row: typeof tasks.$inferSelect): TaskItem => ({
  id: row.id,
  title: row.title,
  domain: row.domain,
  dueDate: row.dueDate,
  priority: row.priority,
  status: row.status,
  recurrence: row.recurrence,
});

/** TaskItem plus the fields only the edit page needs. */
export type TaskDetail = TaskItem & { notes: string | null };

export async function getTask(
  userId: string,
  taskId: string,
): Promise<TaskDetail | null> {
  const [row] = await forUser(userId).select(tasks, {
    where: eq(tasks.id, taskId),
  });
  return row && !row.archived ? { ...toItem(row), notes: row.notes } : null;
}

/** Edits the FR-PERS.1 fields. Status is not touched here (tick flow owns it). */
export async function updateTask(
  userId: string,
  taskId: string,
  input: {
    title: string;
    notes: string | null;
    domain: Domain;
    dueDate: string | null;
    priority: number;
    recurrence: string | null;
  },
): Promise<void> {
  await forUser(userId).update(
    tasks,
    {
      title: input.title,
      notes: input.notes,
      domain: input.domain,
      dueDate: input.dueDate,
      priority: input.priority,
      recurrence: input.recurrence,
    },
    eq(tasks.id, taskId),
  );
}

/** Soft delete — archived tasks leave every list but stay for reviews. */
export async function archiveTask(userId: string, taskId: string): Promise<void> {
  await forUser(userId).update(tasks, { archived: true }, eq(tasks.id, taskId));
}

export async function listTasks(userId: string): Promise<TaskItem[]> {
  const rows = await forUser(userId).select(tasks, {
    where: eq(tasks.archived, false),
  });
  return sortTasks(rows.map(toItem));
}

export async function createTask(
  userId: string,
  input: {
    title: string;
    domain: Domain;
    dueDate: string | null;
    priority: number;
    recurrence: string | null;
  },
): Promise<TaskItem> {
  const [row] = await forUser(userId).insert(tasks, {
    title: input.title,
    domain: input.domain,
    dueDate: input.dueDate,
    priority: input.priority,
    recurrence: input.recurrence,
  });
  return toItem(row);
}

/**
 * Sets a task's status.
 *
 * Completing a *recurring* task rolls it forward in place: the due date
 * advances to the next occurrence (counted from the later of due date and
 * today, so overdue tasks don't backfill) and the task stays open. This
 * replaces the earlier "mark done + insert a clone" behaviour, which left two
 * rows and read as the task duplicating on click. One row, no clone.
 *
 * Dropping a recurring task ends the series normally (status → dropped).
 */
export async function setTaskStatus(
  userId: string,
  taskId: string,
  status: TaskStatus,
): Promise<void> {
  const udb = forUser(userId);

  const [current] = await udb.select(tasks, { where: eq(tasks.id, taskId) });
  if (!current) return;

  if (status === "done" && current.status === "open" && current.recurrence) {
    const today = todayISO();
    const from =
      current.dueDate && current.dueDate > today ? current.dueDate : today;
    const nextDue = nextDueISO(current.recurrence, from);
    if (nextDue) {
      // roll forward in place; task remains open at its next occurrence
      await udb.update(tasks, { dueDate: nextDue }, eq(tasks.id, taskId));
      return;
    }
    // unparseable rule → fall through and mark it done like a normal task
  }

  await udb.update(tasks, { status }, eq(tasks.id, taskId));
}
