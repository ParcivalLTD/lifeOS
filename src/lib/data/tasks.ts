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
 * Sets a task's status. Completing a recurring task spawns the next
 * occurrence: due = next per rule, counted from the later of (due date,
 * today) so overdue recurring tasks don't pile up a backlog.
 */
export async function setTaskStatus(
  userId: string,
  taskId: string,
  status: TaskStatus,
): Promise<void> {
  const udb = forUser(userId);

  const [current] = await udb.select(tasks, { where: eq(tasks.id, taskId) });
  if (!current) return;

  await udb.update(tasks, { status }, eq(tasks.id, taskId));

  if (status === "done" && current.status !== "done" && current.recurrence) {
    const today = todayISO();
    const from =
      current.dueDate && current.dueDate > today ? current.dueDate : today;
    const nextDue = nextDueISO(current.recurrence, from);
    if (nextDue) {
      await udb.insert(tasks, {
        domain: current.domain,
        title: current.title,
        notes: current.notes,
        priority: current.priority,
        dueDate: nextDue,
        recurrence: current.recurrence,
        goalId: current.goalId,
      });
    }
  }
}
