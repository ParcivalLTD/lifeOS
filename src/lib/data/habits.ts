import { and, eq, gte } from "drizzle-orm";
import { forUser } from "@/db";
import { habitCompletions, habits, type HabitSchedule } from "@/db/schema";
import { addDaysISO } from "@/lib/dates";
import {
  adherenceWindow,
  isScheduledOn,
  pct,
  scheduleLabel,
  streak,
} from "@/lib/habits";
import type { Domain } from "@/lib/domains";

/** How far back completions are loaded for streak walks (longest streak cap). */
const HISTORY_DAYS = 400;

/** Serializable shape passed to client components. */
export type HabitItem = {
  id: string;
  title: string;
  domain: Domain;
  schedule: HabitSchedule;
  scheduleLabel: string;
  scheduledToday: boolean;
  doneToday: boolean;
  streak: number;
  adherence7: number;
};

export type HabitsOverview = {
  habits: HabitItem[];
  doneToday: number;
  scheduledToday: number;
  adherence7: number;
};

export async function listHabitsWithStats(
  userId: string,
  today: string,
): Promise<HabitsOverview> {
  const udb = forUser(userId);

  const habitRows = await udb.select(habits, {
    where: eq(habits.archived, false),
    orderBy: [habits.createdAt],
  });

  const completions = await udb.select(habitCompletions, {
    where: gte(habitCompletions.date, addDaysISO(today, -HISTORY_DAYS)),
  });

  const doneByHabit = new Map<string, Set<string>>();
  for (const c of completions) {
    if (c.status !== "done") continue;
    let set = doneByHabit.get(c.habitId);
    if (!set) doneByHabit.set(c.habitId, (set = new Set()));
    set.add(c.date);
  }

  let windowDone = 0;
  let windowExpected = 0;

  const items: HabitItem[] = habitRows.map((h) => {
    const done = doneByHabit.get(h.id) ?? new Set<string>();
    const win = adherenceWindow(h.schedule, done, today);
    windowDone += win.done;
    windowExpected += win.expected;
    return {
      id: h.id,
      title: h.title,
      domain: h.domain,
      schedule: h.schedule,
      scheduleLabel: scheduleLabel(h.schedule),
      scheduledToday: isScheduledOn(h.schedule, today),
      doneToday: done.has(today),
      streak: streak(h.schedule, done, today),
      adherence7: pct(win.done, win.expected),
    };
  });

  // scheduled-today first, stable within groups (creation order)
  const ordered = items
    .map((item, i) => ({ item, i }))
    .sort(
      (a, b) =>
        Number(b.item.scheduledToday) - Number(a.item.scheduledToday) || a.i - b.i,
    )
    .map(({ item }) => item);

  return {
    habits: ordered,
    doneToday: items.filter((h) => h.doneToday).length,
    scheduledToday: items.filter((h) => h.scheduledToday).length,
    adherence7: pct(windowDone, windowExpected),
  };
}

export type HabitDetail = {
  id: string;
  title: string;
  domain: Domain;
  schedule: HabitSchedule;
};

export async function getHabit(
  userId: string,
  habitId: string,
): Promise<HabitDetail | null> {
  const [row] = await forUser(userId).select(habits, {
    where: eq(habits.id, habitId),
  });
  return row && !row.archived
    ? { id: row.id, title: row.title, domain: row.domain, schedule: row.schedule }
    : null;
}

/** Shape-compare ignoring `since` (a title edit must not restart history). */
const sameShape = (a: HabitSchedule, b: HabitSchedule): boolean => {
  if (a.type !== b.type) return false;
  if (a.type === "weekly_days" && b.type === "weekly_days") {
    return [...a.days].sort().join() === [...b.days].sort().join();
  }
  if (a.type === "times_per_week" && b.type === "times_per_week") {
    return a.times === b.times;
  }
  return true; // both daily
};

/**
 * Edits title/domain/schedule. The completion log is never touched. When the
 * schedule's shape actually changes, `since = today` is stamped onto it so
 * streak/adherence are computed only under the new schedule from today
 * forward — history keeps its meaning under the old schedule. Passing
 * schedule: null keeps the current schedule (incl. any earlier `since`).
 */
export async function updateHabit(
  userId: string,
  habitId: string,
  input: {
    title: string;
    domain: Domain;
    schedule: HabitSchedule | null;
    today: string;
  },
): Promise<void> {
  const udb = forUser(userId);
  const [current] = await udb.select(habits, { where: eq(habits.id, habitId) });
  if (!current) return;

  let schedule = current.schedule;
  if (input.schedule && !sameShape(input.schedule, current.schedule)) {
    schedule = { ...input.schedule, since: input.today };
  }

  await udb.update(
    habits,
    { title: input.title, domain: input.domain, schedule },
    eq(habits.id, habitId),
  );
}

/**
 * Soft delete. The habit leaves every list; its completion-log rows are
 * deliberately RETAINED — they are the historical record weekly/monthly
 * reviews (Phase 3) read, and they come back intact if the habit is ever
 * un-archived.
 */
export async function archiveHabit(userId: string, habitId: string): Promise<void> {
  await forUser(userId).update(habits, { archived: true }, eq(habits.id, habitId));
}

export async function createHabit(
  userId: string,
  input: { title: string; domain: Domain; schedule: HabitSchedule },
): Promise<void> {
  await forUser(userId).insert(habits, {
    title: input.title,
    domain: input.domain,
    schedule: input.schedule,
  });
}

/** Ticks/unticks a completion for the given date (unique per habit+date). */
export async function setHabitCompletion(
  userId: string,
  habitId: string,
  dateISO: string,
  done: boolean,
): Promise<void> {
  const udb = forUser(userId);

  const [habit] = await udb.select(habits, { where: eq(habits.id, habitId) });
  if (!habit) return;

  if (done) {
    await udb.insert(
      habitCompletions,
      { habitId, date: dateISO, status: "done" },
      {
        onConflict: {
          target: [habitCompletions.habitId, habitCompletions.date],
          set: { status: "done" },
        },
      },
    );
  } else {
    await udb.delete(
      habitCompletions,
      and(
        eq(habitCompletions.habitId, habitId),
        eq(habitCompletions.date, dateISO),
      ),
    );
  }
}
