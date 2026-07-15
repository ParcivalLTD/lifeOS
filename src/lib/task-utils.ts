/** Pure task helpers shared by server data layer and client panels. */
import type { Domain } from "./domains";

export type TaskStatus = "open" | "done" | "dropped";

/** Serializable shape passed to client components. */
export type TaskItem = {
  id: string;
  title: string;
  domain: Domain;
  dueDate: string | null;
  priority: number;
  status: TaskStatus;
  recurrence: string | null;
};

/**
 * Due asc (nulls last), then priority, then title — independent of status:
 * done/dropped rows keep their place with line-through (design hard rule),
 * so ticking never reorders the list under the user's thumb.
 */
export function sortTasks(items: TaskItem[]): TaskItem[] {
  return items.slice().sort((a, b) => {
    const ad = a.dueDate ?? "9999-12-31";
    const bd = b.dueDate ?? "9999-12-31";
    if (ad !== bd) return ad < bd ? -1 : 1;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.title.localeCompare(b.title);
  });
}
