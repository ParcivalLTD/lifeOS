/**
 * Pure, client-safe list filters for the Tasks and Habits views (type-only
 * imports, no I/O). Extracted so the filter semantics can be unit-tested.
 */
import { daysBetween } from "./dates";
import type { Domain } from "./domains";
import type { HabitItem } from "./data/habits";
import type { TaskItem, TaskStatus } from "./task-utils";

// --- Tasks -------------------------------------------------------------------

export type TaskFilter = {
  /** Only consulted when `status` is "all": hides settled (done+dropped) rows. */
  showDone: boolean;
  status: "all" | TaskStatus;
  priority: "all" | 1 | 2 | 3;
  due: "all" | "overdue" | "today" | "week";
};

export const DEFAULT_TASK_FILTER: TaskFilter = {
  showDone: false,
  status: "all",
  priority: "all",
  due: "all",
};

export function filterTasks(
  tasks: TaskItem[],
  filter: TaskFilter,
  today: string,
): TaskItem[] {
  return tasks.filter((t) => {
    // status / hide-done: an explicit status wins; otherwise hide-done governs
    if (filter.status !== "all") {
      if (t.status !== filter.status) return false;
    } else if (!filter.showDone && t.status !== "open") {
      return false;
    }

    if (filter.priority !== "all" && t.priority !== filter.priority) return false;

    if (filter.due !== "all") {
      if (!t.dueDate) return false;
      const delta = daysBetween(today, t.dueDate); // <0 past, 0 today, >0 future
      if (filter.due === "overdue" && !(delta < 0 && t.status === "open")) return false;
      if (filter.due === "today" && delta !== 0) return false;
      if (filter.due === "week" && !(delta >= 0 && delta <= 7)) return false;
    }

    return true;
  });
}

export const taskFilterActive = (f: TaskFilter): boolean =>
  f.showDone || f.status !== "all" || f.priority !== "all" || f.due !== "all";

// --- Habits ------------------------------------------------------------------

export type HabitFilter = {
  /** Hides habits already ticked today, keeping the daily checklist to-do. */
  hideDone: boolean;
  domain: "all" | Domain;
  scheduleType: "all" | "daily" | "weekly_days" | "times_per_week";
};

export const DEFAULT_HABIT_FILTER: HabitFilter = {
  hideDone: true,
  domain: "all",
  scheduleType: "all",
};

export function filterHabits(
  habits: HabitItem[],
  filter: HabitFilter,
): HabitItem[] {
  return habits.filter((h) => {
    if (filter.hideDone && h.doneToday) return false;
    if (filter.domain !== "all" && h.domain !== filter.domain) return false;
    if (filter.scheduleType !== "all" && h.schedule.type !== filter.scheduleType) {
      return false;
    }
    return true;
  });
}

export const habitFilterActive = (f: HabitFilter): boolean =>
  !f.hideDone || f.domain !== "all" || f.scheduleType !== "all";
