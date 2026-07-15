import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
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
  const habitRows = await db
    .select()
    .from(habits)
    .where(and(eq(habits.userId, userId), eq(habits.archived, false)))
    .orderBy(habits.createdAt);

  const completions = await db
    .select({
      habitId: habitCompletions.habitId,
      date: habitCompletions.date,
      status: habitCompletions.status,
    })
    .from(habitCompletions)
    .where(
      and(
        eq(habitCompletions.userId, userId),
        gte(habitCompletions.date, addDaysISO(today, -HISTORY_DAYS)),
      ),
    );

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

export async function createHabit(
  userId: string,
  input: { title: string; domain: Domain; schedule: HabitSchedule },
): Promise<void> {
  await db.insert(habits).values({
    userId,
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
  const [habit] = await db
    .select({ id: habits.id })
    .from(habits)
    .where(and(eq(habits.id, habitId), eq(habits.userId, userId)));
  if (!habit) return;

  if (done) {
    await db
      .insert(habitCompletions)
      .values({ userId, habitId, date: dateISO, status: "done" })
      .onConflictDoUpdate({
        target: [habitCompletions.habitId, habitCompletions.date],
        set: { status: "done" },
      });
  } else {
    await db
      .delete(habitCompletions)
      .where(
        and(
          eq(habitCompletions.userId, userId),
          eq(habitCompletions.habitId, habitId),
          eq(habitCompletions.date, dateISO),
        ),
      );
  }
}
