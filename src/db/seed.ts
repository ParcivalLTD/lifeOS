/**
 * Seed script — realistic single-owner data across all six domains,
 * mirroring the design mockup (docs/design/LifeOS.dc.html).
 *
 * Idempotent: wipes and re-inserts all rows belonging to the seed user.
 * Dates are generated relative to "today" so the data always looks live.
 *
 * Usage: npm run db:seed
 * The owner id defaults to a fixed UUID; set SEED_USER_ID to your real
 * Supabase auth.users id when seeding a Supabase project.
 */
import { config } from "dotenv";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import type { HabitSchedule } from "./schema";

config({ path: [".env.local", ".env"], quiet: true });

const OWNER = process.env.SEED_USER_ID ?? "00000000-0000-0000-0000-000000000001";

// --- date helpers (local time, evergreen relative to today) -----------------

const today = new Date();
today.setHours(0, 0, 0, 0);

/** Date at midnight, `offset` days from today. */
const day = (offset: number): Date => {
  const d = new Date(today);
  d.setDate(d.getDate() + offset);
  return d;
};

/** Timestamp `offset` days from today at hh:mm local. */
const at = (offset: number, h: number, m = 0): Date => {
  const d = day(offset);
  d.setHours(h, m, 0, 0);
  return d;
};

/** Local YYYY-MM-DD (no UTC shift). */
const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  console.log(`seeding for user ${OWNER}`);

  // --- wipe this user's rows (children before parents) ---------------------
  await db.delete(schema.links).where(eq(schema.links.userId, OWNER));
  await db
    .delete(schema.habitCompletions)
    .where(eq(schema.habitCompletions.userId, OWNER));
  await db
    .delete(schema.metricDatapoints)
    .where(eq(schema.metricDatapoints.userId, OWNER));
  await db.delete(schema.tasks).where(eq(schema.tasks.userId, OWNER));
  await db
    .delete(schema.journalEntries)
    .where(eq(schema.journalEntries.userId, OWNER));
  await db.delete(schema.events).where(eq(schema.events.userId, OWNER));
  await db.delete(schema.habits).where(eq(schema.habits.userId, OWNER));
  await db.delete(schema.metrics).where(eq(schema.metrics.userId, OWNER));
  await db.delete(schema.goals).where(eq(schema.goals.userId, OWNER));

  // --- goals (§7.1): life → yearly → quarterly → monthly -------------------
  const [gCareer, gFinsec, gStrong] = await db
    .insert(schema.goals)
    .values([
      {
        userId: OWNER,
        domain: "work",
        title: "Build a career as an ML engineer",
        horizon: "life",
        successCriteria: "Working full-time on production ML systems",
      },
      {
        userId: OWNER,
        domain: "finance",
        title: "Long-term financial security",
        horizon: "life",
        successCriteria: "12 months of expenses saved; investing monthly",
      },
      {
        userId: OWNER,
        domain: "gym",
        title: "Strong and pain-free for life",
        horizon: "life",
        successCriteria: "Training 3×+/week at 60; no chronic injuries",
      },
    ])
    .returning();

  const [gWam, gDeposit, gBench, gRun] = await db
    .insert(schema.goals)
    .values([
      {
        userId: OWNER,
        domain: "academic",
        title: "Finish Year 3 with ≥ 80 WAM",
        horizon: "yearly",
        parentGoalId: gCareer.id,
        targetDate: `${today.getFullYear()}-12-15`,
        successCriteria: "WAM ≥ 80.0 after semester 2 results",
      },
      {
        userId: OWNER,
        domain: "finance",
        title: "Save A$12,000 house deposit",
        horizon: "yearly",
        parentGoalId: gFinsec.id,
        targetDate: `${today.getFullYear()}-12-31`,
        successCriteria: "HISA balance ≥ A$12,000",
      },
      {
        userId: OWNER,
        domain: "gym",
        title: "Bench press 100 kg",
        horizon: "yearly",
        parentGoalId: gStrong.id,
        targetDate: `${today.getFullYear()}-12-31`,
        successCriteria: "1 clean rep at 100 kg, paused",
      },
      {
        userId: OWNER,
        domain: "health",
        title: "Run 10 k under 50:00",
        horizon: "yearly",
        parentGoalId: gStrong.id,
        targetDate: `${today.getFullYear()}-11-30`,
        successCriteria: "Official or GPS-verified 10 k < 50:00",
      },
    ])
    .returning();

  const [gLifeos, gCapstone, gEatOut] = await db
    .insert(schema.goals)
    .values([
      {
        userId: OWNER,
        domain: "personal",
        title: "Ship LifeOS Phase 1",
        horizon: "quarterly",
        targetDate: iso(day(32)),
        successCriteria: "Using it every morning instead of to-do + calendar apps",
      },
      {
        userId: OWNER,
        domain: "academic",
        title: "Scope COMP3888 capstone project",
        horizon: "quarterly",
        parentGoalId: gWam.id,
        targetDate: iso(day(14)),
        successCriteria: "Preference form in; team + supervisor confirmed",
      },
      {
        userId: OWNER,
        domain: "finance",
        title: "Eating out < A$200 / month",
        horizon: "quarterly",
        parentGoalId: gDeposit.id,
        successCriteria: "Category spend under cap for 3 consecutive months",
      },
    ])
    .returning();

  await db.insert(schema.goals).values({
    userId: OWNER,
    domain: "gym",
    title: "Complete 16 training sessions this month",
    horizon: "monthly",
    parentGoalId: gStrong.id,
    targetDate: iso(day(17)),
    successCriteria: "16 logged gym sessions this calendar month",
  });

  // --- events (§7.4): past week, today, next week ---------------------------
  const gymPayload = (
    template: string,
    exercises: [string, number, number, number][],
    done: boolean,
  ) => ({
    template,
    exercises: exercises.map(([name, targetSets, targetReps, targetKg]) => ({
      name,
      targetSets,
      targetReps,
      targetKg,
      sets: Array.from({ length: targetSets }, () => ({
        kg: targetKg,
        reps: targetReps,
        done,
      })),
    })),
  });

  const upperA: [string, number, number, number][] = [
    ["Bench Press", 4, 6, 82.5],
    ["Barbell Row", 4, 8, 70],
    ["Overhead Press", 3, 8, 47.5],
    ["Lat Pulldown", 3, 10, 61],
    ["EZ-Bar Curl", 3, 12, 30],
  ];
  const lowerA: [string, number, number, number][] = [
    ["Squat", 4, 5, 110],
    ["Romanian Deadlift", 3, 8, 90],
    ["Leg Press", 3, 10, 180],
    ["Calf Raise", 3, 12, 60],
  ];

  const insertedEvents = await db
    .insert(schema.events)
    .values([
      // past
      {
        userId: OWNER,
        domain: "gym",
        title: "Gym — Lower A",
        start: at(-1, 7),
        end: at(-1, 8),
        kind: "session",
        goalId: gStrong.id,
        payload: gymPayload("Lower A", lowerA, true),
      },
      {
        userId: OWNER,
        domain: "personal",
        title: "Meal prep",
        start: at(-1, 19),
        end: at(-1, 20),
        kind: "other",
      },
      // today
      {
        userId: OWNER,
        domain: "gym",
        title: "Gym — Upper A",
        start: at(0, 7),
        end: at(0, 8),
        kind: "session",
        goalId: gBench.id,
        payload: gymPayload("Upper A", upperA, false),
      },
      {
        userId: OWNER,
        domain: "work",
        title: "Standup — Atlas project",
        start: at(0, 9, 30),
        end: at(0, 9, 45),
        kind: "appointment",
      },
      {
        userId: OWNER,
        domain: "work",
        title: "Deep work — Atlas API migration",
        start: at(0, 10),
        end: at(0, 13),
        kind: "session",
      },
      {
        userId: OWNER,
        domain: "health",
        title: "Dentist — 6-month checkup",
        start: at(0, 14, 30),
        end: at(0, 15, 15),
        kind: "appointment",
      },
      {
        userId: OWNER,
        domain: "academic",
        title: "Study block — COMP3888 proposal",
        start: at(0, 16),
        end: at(0, 17, 30),
        kind: "session",
        goalId: gCapstone.id,
      },
      {
        userId: OWNER,
        domain: "finance",
        title: "Electricity bill",
        start: at(0, 0),
        allDay: true,
        kind: "bill",
        payload: { amount: 187, currency: "AUD" },
      },
      // rest of the week
      {
        userId: OWNER,
        domain: "gym",
        title: "Gym — Upper B",
        start: at(1, 7),
        end: at(1, 8),
        kind: "session",
        goalId: gStrong.id,
      },
      {
        userId: OWNER,
        domain: "academic",
        title: "COMP3888 team call",
        start: at(1, 11),
        end: at(1, 12),
        kind: "appointment",
        goalId: gCapstone.id,
      },
      {
        userId: OWNER,
        domain: "finance",
        title: "Netflix",
        start: at(1, 0),
        allDay: true,
        kind: "bill",
        payload: { amount: 22.99, currency: "AUD", autopay: true },
      },
      {
        userId: OWNER,
        domain: "health",
        title: "Run — 5 k tempo",
        start: at(2, 17, 30),
        end: at(2, 18, 15),
        kind: "session",
        goalId: gRun.id,
      },
      {
        userId: OWNER,
        domain: "gym",
        title: "Gym — Lower B",
        start: at(3, 7),
        end: at(3, 8),
        kind: "session",
        goalId: gStrong.id,
      },
      {
        userId: OWNER,
        domain: "work",
        title: "Atlas sprint review",
        start: at(3, 15),
        end: at(3, 16),
        kind: "appointment",
      },
      {
        userId: OWNER,
        domain: "personal",
        title: "Mum's birthday",
        start: at(4, 0),
        allDay: true,
        kind: "birthday",
      },
      {
        userId: OWNER,
        domain: "personal",
        title: "Family dinner",
        start: at(4, 18, 30),
        end: at(4, 21),
        kind: "appointment",
      },
      {
        userId: OWNER,
        domain: "finance",
        title: "Rent",
        start: at(5, 0),
        allDay: true,
        kind: "bill",
        payload: { amount: 620, currency: "AUD" },
      },
      {
        userId: OWNER,
        domain: "health",
        title: "Long run — 8 k",
        start: at(5, 10),
        end: at(5, 11),
        kind: "session",
        goalId: gRun.id,
      },
      {
        userId: OWNER,
        domain: "academic",
        title: "COMP3888 proposal due",
        start: at(38, 0),
        allDay: true,
        kind: "deadline",
        goalId: gCapstone.id,
      },
      {
        userId: OWNER,
        domain: "health",
        title: "Flu shot — booked",
        start: at(8, 11),
        end: at(8, 11, 30),
        kind: "appointment",
      },
    ])
    .returning({ id: schema.events.id, title: schema.events.title });

  const electricityBill = insertedEvents.find(
    (e) => e.title === "Electricity bill",
  )!;

  // --- tasks (§7.2) ----------------------------------------------------------
  const [tPreference] = await db
    .insert(schema.tasks)
    .values([
      {
        userId: OWNER,
        domain: "academic",
        title: "Submit COMP3888 project preference form",
        dueDate: iso(day(0)),
        priority: 1,
        goalId: gCapstone.id,
      },
      {
        userId: OWNER,
        domain: "finance",
        title: "Pay electricity bill",
        notes: "A$187, due today — BPAY ref in email",
        dueDate: iso(day(0)),
        priority: 1,
        eventId: electricityBill.id,
      },
      {
        userId: OWNER,
        domain: "academic",
        title: "Email Dr Shen re: thesis expression of interest",
        dueDate: iso(day(1)),
        priority: 2,
      },
      {
        userId: OWNER,
        domain: "gym",
        title: "Renew gym membership",
        dueDate: iso(day(2)),
        priority: 2,
        recurrence: "FREQ=YEARLY",
      },
      {
        userId: OWNER,
        domain: "personal",
        title: "Book car service",
        dueDate: iso(day(3)),
        priority: 3,
        status: "done",
      },
      {
        userId: OWNER,
        domain: "personal",
        title: "Weekly review",
        dueDate: iso(day(5)),
        priority: 2,
        recurrence: "FREQ=WEEKLY;BYDAY=SU",
        goalId: gLifeos.id,
      },
    ])
    .returning();

  // --- habits (§7.3) + completion log ---------------------------------------
  const habitDefs: {
    title: string;
    domain: (typeof schema.domainEnum.enumValues)[number];
    schedule: HabitSchedule;
    goalId?: string;
    streak: number; // consecutive applicable days done, ending yesterday
  }[] = [
    {
      title: "Morning mobility (10 min)",
      domain: "gym",
      schedule: { type: "daily" },
      goalId: gStrong.id,
      streak: 8,
    },
    {
      title: "Read 20 min",
      domain: "personal",
      schedule: { type: "daily" },
      streak: 12,
    },
    {
      title: "10,000 steps",
      domain: "health",
      schedule: { type: "daily" },
      streak: 4,
    },
    {
      title: "Journal + mood check-in",
      domain: "personal",
      schedule: { type: "daily" },
      streak: 23,
    },
    {
      title: "No takeaway Mon–Thu",
      domain: "finance",
      schedule: { type: "weekly_days", days: ["mon", "tue", "wed", "thu"] },
      goalId: gEatOut.id,
      streak: 2,
    },
    {
      title: "Train 3× / week",
      domain: "gym",
      schedule: { type: "times_per_week", times: 3 },
      goalId: gBench.id,
      streak: 6,
    },
  ];

  const insertedHabits = await db
    .insert(schema.habits)
    .values(
      habitDefs.map((h) => ({
        userId: OWNER,
        domain: h.domain,
        title: h.title,
        schedule: h.schedule,
        goalId: h.goalId,
      })),
    )
    .returning();

  const dow = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  const completionRows: (typeof schema.habitCompletions.$inferInsert)[] = [];
  insertedHabits.forEach((habit, hi) => {
    const def = habitDefs[hi];
    let applicableSeen = 0;
    for (let i = 1; i <= 35; i++) {
      const d = day(-i);
      if (def.schedule.type === "weekly_days") {
        if (!def.schedule.days.includes(dow[d.getDay()])) continue;
      } else if (def.schedule.type === "times_per_week") {
        // approximate a Mon/Wed/Fri rhythm for n-per-week habits
        if (![1, 3, 5].includes(d.getDay())) continue;
      }
      applicableSeen += 1;
      let status: "done" | "skipped";
      if (applicableSeen <= def.streak) {
        status = "done"; // current streak, ending yesterday
      } else if (applicableSeen === def.streak + 1) {
        status = "skipped"; // the day that broke the streak
      } else {
        status = (i * 7 + hi) % 10 < 7 ? "done" : "skipped"; // ~70% adherence
      }
      completionRows.push({
        userId: OWNER,
        habitId: habit.id,
        date: iso(d),
        status,
      });
    }
  });
  await db.insert(schema.habitCompletions).values(completionRows);

  // --- metrics (§7.5) + datapoints -------------------------------------------
  const [mWeight, mSleep, mBench, mNetWorth, mWam, mEatOut] = await db
    .insert(schema.metrics)
    .values([
      {
        userId: OWNER,
        domain: "health",
        name: "Body weight",
        unit: "kg",
        direction: "lower-better",
      },
      {
        userId: OWNER,
        domain: "health",
        name: "Sleep hours",
        unit: "h",
        direction: "target-range",
      },
      {
        userId: OWNER,
        domain: "gym",
        name: "Bench press e1RM",
        unit: "kg",
        direction: "higher-better",
      },
      {
        userId: OWNER,
        domain: "finance",
        name: "Net worth",
        unit: "AUD",
        direction: "higher-better",
      },
      {
        userId: OWNER,
        domain: "academic",
        name: "WAM",
        unit: "%",
        direction: "higher-better",
      },
      {
        userId: OWNER,
        domain: "finance",
        name: "Eating out — monthly spend",
        unit: "AUD",
        direction: "lower-better",
      },
    ])
    .returning();

  const dp = (
    metricId: string,
    points: [Date, number][],
    source = "manual",
  ): (typeof schema.metricDatapoints.$inferInsert)[] =>
    points.map(([timestamp, value]) => ({
      userId: OWNER,
      metricId,
      timestamp,
      value,
      source,
    }));

  const weights = [79.6, 79.4, 79.1, 79.0, 78.7, 78.6, 78.4, 78.2];
  const bench = [87.5, 88.5, 90, 90, 91.5, 92.5, 94, 95];
  const netWorth = [24100, 24800, 25600, 26300, 27100, 27900, 28700, 29342];
  const sleep = [6.9, 8.1, 5.9, 7.0, 6.1, 7.4, 6.2]; // oldest → newest

  await db.insert(schema.metricDatapoints).values([
    ...dp(mWeight.id, weights.map((v, i) => [at(-7 * (weights.length - 1 - i), 7), v])),
    ...dp(mBench.id, bench.map((v, i) => [at(-7 * (bench.length - 1 - i), 8), v]), "gym-log"),
    ...dp(mNetWorth.id, netWorth.map((v, i) => [at(-30 * (netWorth.length - 1 - i), 9), v])),
    ...dp(mSleep.id, sleep.map((v, i) => [at(-(sleep.length - i), 7), v])),
    ...dp(mWam.id, [
      [at(-400, 12), 76.2],
      [at(-190, 12), 77.8],
      [at(-30, 12), 78.4],
    ], "uni-results"),
    ...dp(mEatOut.id, [
      [at(-90, 12), 232],
      [at(-60, 12), 214],
      [at(-30, 12), 189],
      [at(-1, 12), 148.5],
    ]),
  ]);

  // --- journal entries (§7.6) -------------------------------------------------
  await db.insert(schema.journalEntries).values([
    {
      userId: OWNER,
      domain: "personal",
      date: iso(day(-1)),
      body: "Lower A done before work. Shift dragged — energy dipped hard by 15:00. Meal-prepped for the week, which already feels like a win.",
      mood: 4,
      energy: 3,
      tags: ["gym", "work"],
    },
    {
      userId: OWNER,
      domain: "personal",
      date: iso(day(-2)),
      body: "Long run skipped — slept badly. Planned the week instead and set the COMP3888 shortlist. Dinner out with J, over budget again.",
      mood: 3,
      energy: 2,
      tags: ["health", "academic", "finance"],
    },
    {
      userId: OWNER,
      domain: "personal",
      date: iso(day(-3)),
      body: "Groceries, cleaned the flat, read 40 min. Quiet day. Bench felt strong in Friday's session — 100 kg feels realistic this year.",
      mood: 4,
      energy: 4,
      tags: ["gym"],
    },
  ]);

  // --- links (§7.7): the cross-domain graph -----------------------------------
  await db.insert(schema.links).values([
    {
      userId: OWNER,
      domain: "finance",
      fromId: gDeposit.id,
      fromType: "goal",
      toId: gFinsec.id,
      toType: "goal",
      relation: "funds",
    },
    {
      userId: OWNER,
      domain: "academic",
      fromId: gCapstone.id,
      fromType: "goal",
      toId: gCareer.id,
      toType: "goal",
      relation: "supports",
    },
    {
      userId: OWNER,
      domain: "gym",
      fromId: gBench.id,
      fromType: "goal",
      toId: gStrong.id,
      toType: "goal",
      relation: "supports",
    },
    {
      userId: OWNER,
      domain: "academic",
      fromId: tPreference.id,
      fromType: "task",
      toId: gCapstone.id,
      toType: "goal",
      relation: "blocks",
    },
    {
      userId: OWNER,
      domain: "gym",
      fromId: mBench.id,
      fromType: "metric",
      toId: gBench.id,
      toType: "goal",
      relation: "relates-to",
    },
    {
      userId: OWNER,
      domain: "finance",
      fromId: mNetWorth.id,
      fromType: "metric",
      toId: gFinsec.id,
      toType: "goal",
      relation: "relates-to",
    },
    {
      userId: OWNER,
      domain: "academic",
      fromId: mWam.id,
      fromType: "metric",
      toId: gWam.id,
      toType: "goal",
      relation: "relates-to",
    },
    {
      userId: OWNER,
      domain: "finance",
      fromId: mEatOut.id,
      fromType: "metric",
      toId: gEatOut.id,
      toType: "goal",
      relation: "relates-to",
    },
    {
      userId: OWNER,
      domain: "health",
      fromId: mWeight.id,
      fromType: "metric",
      toId: gStrong.id,
      toType: "goal",
      relation: "relates-to",
    },
  ]);

  // --- summary -----------------------------------------------------------------
  const tables = [
    ["goals", schema.goals],
    ["tasks", schema.tasks],
    ["habits", schema.habits],
    ["habit_completions", schema.habitCompletions],
    ["events", schema.events],
    ["metrics", schema.metrics],
    ["metric_datapoints", schema.metricDatapoints],
    ["journal_entries", schema.journalEntries],
    ["links", schema.links],
  ] as const;

  for (const [name, table] of tables) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(table);
    console.log(`  ${name.padEnd(18)} ${n}`);
  }

  await client.end();
  console.log("seed complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
