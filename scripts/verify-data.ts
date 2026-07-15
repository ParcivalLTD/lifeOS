/**
 * Data-layer regression check for FR-PERS.1 (Tasks) and FR-PERS.2 (Habits).
 * Uses synthetic fixtures with exact expectations and CLEANS UP AFTER ITSELF —
 * safe to run against a database holding real data (no reseed required).
 *
 * Usage: npm run test:data
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : `  ${detail}`}`);
};

const FIXTURE_PREFIX = "__verify__ ";

async function main() {
  const { forUser, closeDb } = await import("@/db");
  const { tasks, habitCompletions, habits } = await import("@/db/schema");
  const { eq, inArray, like } = await import("drizzle-orm");
  const {
    listTasks, createTask, setTaskStatus, getTask, updateTask, archiveTask,
  } = await import("@/lib/data/tasks");
  const {
    listHabitsWithStats, createHabit, setHabitCompletion,
    getHabit, updateHabit, archiveHabit,
  } = await import("@/lib/data/habits");
  const { todayISO, addDaysISO, weekdayOf } = await import("@/lib/dates");
  const { dayKeyOf, streak, adherenceWindow } = await import("@/lib/habits");
  const {
    filterTasks, filterHabits, DEFAULT_TASK_FILTER, DEFAULT_HABIT_FILTER,
  } = await import("@/lib/list-filters");
  type TaskItemT = import("@/lib/task-utils").TaskItem;
  type HabitItemT = import("@/lib/data/habits").HabitItem;

  const OWNER = process.env.SEED_USER_ID!;
  const FOREIGN = "00000000-0000-0000-0000-00000000dead";
  const udb = forUser(OWNER);
  const today = todayISO();

  // stale fixtures from an aborted earlier run must not skew expectations
  await udb.delete(tasks, like(tasks.title, `${FIXTURE_PREFIX}%`));
  const staleHabits = (await udb.select(habits)).filter((h) =>
    h.title.startsWith(FIXTURE_PREFIX),
  );
  if (staleHabits.length) {
    const ids = staleHabits.map((h) => h.id);
    await udb.delete(habitCompletions, inArray(habitCompletions.habitId, ids));
    await udb.delete(habits, inArray(habits.id, ids));
  }

  // ==================== PURE FILTERS + SINCE BOUNDARY ========================
  const P = FIXTURE_PREFIX;
  const sample: TaskItemT[] = [
    { id: "a", title: `${P}open-today-p1`, domain: "personal", dueDate: today, priority: 1, status: "open", recurrence: null },
    { id: "b", title: `${P}done`, domain: "work", dueDate: today, priority: 2, status: "done", recurrence: null },
    { id: "c", title: `${P}dropped`, domain: "gym", dueDate: null, priority: 3, status: "dropped", recurrence: null },
    { id: "d", title: `${P}open-overdue`, domain: "finance", dueDate: addDaysISO(today, -3), priority: 2, status: "open", recurrence: null },
    { id: "e", title: `${P}open-nextweek`, domain: "health", dueDate: addDaysISO(today, 10), priority: 1, status: "open", recurrence: null },
    { id: "f", title: `${P}open-in5`, domain: "personal", dueDate: addDaysISO(today, 5), priority: 2, status: "open", recurrence: null },
  ];
  const ids = (ts: TaskItemT[]) => ts.map((t) => t.id).sort().join(",");
  check("filterTasks default hides done+dropped", ids(filterTasks(sample, DEFAULT_TASK_FILTER, today)) === "a,d,e,f");
  check("filterTasks showDone shows all", filterTasks(sample, { ...DEFAULT_TASK_FILTER, showDone: true }, today).length === 6);
  check("filterTasks status=done", ids(filterTasks(sample, { ...DEFAULT_TASK_FILTER, status: "done" }, today)) === "b");
  check("filterTasks status=dropped", ids(filterTasks(sample, { ...DEFAULT_TASK_FILTER, status: "dropped" }, today)) === "c");
  check("filterTasks priority=1 (open only)", ids(filterTasks(sample, { ...DEFAULT_TASK_FILTER, priority: 1 }, today)) === "a,e");
  check("filterTasks due=overdue", ids(filterTasks(sample, { ...DEFAULT_TASK_FILTER, due: "overdue" }, today)) === "d");
  check("filterTasks due=today", ids(filterTasks(sample, { ...DEFAULT_TASK_FILTER, due: "today" }, today)) === "a");
  check("filterTasks due=week (0..7 incl.)", ids(filterTasks(sample, { ...DEFAULT_TASK_FILTER, due: "week" }, today)) === "a,f");

  const hs: HabitItemT[] = [
    { id: "h1", title: "daily-done", domain: "health", schedule: { type: "daily" }, scheduleLabel: "DAILY", scheduledToday: true, doneToday: true, streak: 1, adherence7: 100 },
    { id: "h2", title: "daily-todo", domain: "personal", schedule: { type: "daily" }, scheduleLabel: "DAILY", scheduledToday: true, doneToday: false, streak: 0, adherence7: 0 },
    { id: "h3", title: "days-gym", domain: "gym", schedule: { type: "weekly_days", days: ["mon"] }, scheduleLabel: "MON", scheduledToday: false, doneToday: false, streak: 0, adherence7: 0 },
  ];
  const hids = (xs: HabitItemT[]) => xs.map((h) => h.id).sort().join(",");
  check("filterHabits default hides done", hids(filterHabits(hs, DEFAULT_HABIT_FILTER)) === "h2,h3");
  check("filterHabits domain=gym", hids(filterHabits(hs, { ...DEFAULT_HABIT_FILTER, domain: "gym" })) === "h3");
  check("filterHabits schedule=daily + hideDone", hids(filterHabits(hs, { ...DEFAULT_HABIT_FILTER, scheduleType: "daily" })) === "h2");
  check("filterHabits show-done + daily", hids(filterHabits(hs, { hideDone: false, domain: "all", scheduleType: "daily" })) === "h1,h2");

  const doneSet = new Set([today, addDaysISO(today, -1), addDaysISO(today, -2), addDaysISO(today, -5)]);
  check("streak daily, no since = 3", streak({ type: "daily" }, doneSet, today) === 3);
  check("streak daily, since=today-1 clips to 2", streak({ type: "daily", since: addDaysISO(today, -1) }, doneSet, today) === 2);
  check(
    "adherence daily, since=today-2 clips window to 3/3",
    JSON.stringify(adherenceWindow({ type: "daily", since: addDaysISO(today, -2) }, doneSet, today)) ===
      JSON.stringify({ done: 3, expected: 3 }),
  );

  // --- snapshot (for the leave-no-trace check at the end) ----------------------
  const initialTaskIds = (await listTasks(OWNER)).map((t) => t.id).sort();
  const initialHabitCount = (await udb.select(habits)).length;
  const initialCompletionCount = (await udb.select(habitCompletions)).length;

  // ============================ TASKS (FR-PERS.1) =============================
  const created = await createTask(OWNER, {
    title: `${FIXTURE_PREFIX}task`,
    domain: "personal",
    dueDate: today,
    priority: 1,
    recurrence: null,
  });
  let list = await listTasks(OWNER);
  check("task create: appears in list", list.some((t) => t.id === created.id));
  const roundTrip = list.find((t) => t.id === created.id)!;
  check(
    "task create: fields round-trip (due today, P1, open)",
    roundTrip.dueDate === today && roundTrip.priority === 1 && roundTrip.status === "open",
    JSON.stringify(roundTrip),
  );
  const idx = list.findIndex((t) => t.id === created.id);
  const laterDue = list.slice(idx + 1).every(
    (t) => (t.dueDate ?? "9999-12-31") > today ||
      ((t.dueDate ?? "") === today && t.priority >= 1),
  );
  check("task sort: due-today P1 sits before later/lower items", laterDue);

  await setTaskStatus(OWNER, created.id, "done");
  list = await listTasks(OWNER);
  check(
    "task complete: status done, row retained",
    list.find((t) => t.id === created.id)?.status === "done",
  );
  check(
    "task complete (non-recurring): no clone spawned",
    list.length === initialTaskIds.length + 1,
    `got ${list.length}`,
  );
  await setTaskStatus(OWNER, created.id, "open");
  check(
    "task reopen: back to open",
    (await listTasks(OWNER)).find((t) => t.id === created.id)?.status === "open",
  );

  const recurring = await createTask(OWNER, {
    title: `${FIXTURE_PREFIX}recurring`,
    domain: "personal",
    dueDate: today,
    priority: 2,
    recurrence: "FREQ=DAILY",
  });
  await setTaskStatus(OWNER, recurring.id, "done");
  list = await listTasks(OWNER);
  const clone = list.find(
    (t) => t.title === `${FIXTURE_PREFIX}recurring` && t.status === "open",
  );
  check("recurring complete: spawns next occurrence", Boolean(clone));
  check(
    "recurring clone: due tomorrow, rule carried",
    clone?.dueDate === addDaysISO(today, 1) && clone?.recurrence === "FREQ=DAILY",
    JSON.stringify(clone),
  );
  await setTaskStatus(OWNER, recurring.id, "done"); // idempotent
  check(
    "recurring re-complete: no second clone",
    (await listTasks(OWNER)).filter((t) => t.title === `${FIXTURE_PREFIX}recurring`).length === 2,
  );

  // scoping through the wrapper
  await setTaskStatus(FOREIGN, created.id, "dropped");
  check(
    "scoping: foreign user cannot mutate",
    (await listTasks(OWNER)).find((t) => t.id === created.id)?.status === "open",
  );
  check("scoping: foreign user sees nothing", (await listTasks(FOREIGN)).length === 0);

  // ============================ HABITS (FR-PERS.2) ============================
  await createHabit(OWNER, {
    title: `${FIXTURE_PREFIX}daily`,
    domain: "health",
    schedule: { type: "daily" },
  });
  let overview = await listHabitsWithStats(OWNER, today);
  let daily = overview.habits.find((h) => h.title === `${FIXTURE_PREFIX}daily`)!;
  check("habit create: listed, scheduled today, streak 0", Boolean(daily) && daily.scheduledToday && daily.streak === 0);

  await setHabitCompletion(OWNER, daily.id, today, true);
  overview = await listHabitsWithStats(OWNER, today);
  daily = overview.habits.find((h) => h.id === daily.id)!;
  check("habit tick today: streak 1, doneToday", daily.streak === 1 && daily.doneToday, `got ${daily.streak}`);

  await setHabitCompletion(OWNER, daily.id, addDaysISO(today, -1), true);
  await setHabitCompletion(OWNER, daily.id, addDaysISO(today, -2), true);
  overview = await listHabitsWithStats(OWNER, today);
  daily = overview.habits.find((h) => h.id === daily.id)!;
  check("habit backfill: streak 3", daily.streak === 3, `got ${daily.streak}`);
  check("habit adherence: 3/7 → 43%", daily.adherence7 === 43, `got ${daily.adherence7}`);

  await setHabitCompletion(OWNER, daily.id, today, false);
  overview = await listHabitsWithStats(OWNER, today);
  daily = overview.habits.find((h) => h.id === daily.id)!;
  check(
    "habit untick today: streak 2 (pending today doesn't break)",
    daily.streak === 2 && !daily.doneToday,
    `got ${daily.streak}`,
  );

  // weekly_days: schedule = { today's weekday, (today-2)'s weekday }
  const wdays = [dayKeyOf(today), dayKeyOf(addDaysISO(today, -2))];
  await createHabit(OWNER, {
    title: `${FIXTURE_PREFIX}weekly`,
    domain: "personal",
    schedule: { type: "weekly_days", days: wdays as never },
  });
  overview = await listHabitsWithStats(OWNER, today);
  let weekly = overview.habits.find((h) => h.title === `${FIXTURE_PREFIX}weekly`)!;
  await setHabitCompletion(OWNER, weekly.id, today, true);
  await setHabitCompletion(OWNER, weekly.id, addDaysISO(today, -2), true);
  overview = await listHabitsWithStats(OWNER, today);
  weekly = overview.habits.find((h) => h.id === weekly.id)!;
  check(
    "weekly_days: streak walks over unscheduled days (2)",
    weekly.streak === 2,
    `got ${weekly.streak}`,
  );
  check(
    "weekly_days: adherence 2/2 scheduled slots → 100%",
    weekly.adherence7 === 100,
    `got ${weekly.adherence7}`,
  );

  // times_per_week (skip on Mon/Tue where the fixture would straddle weeks)
  const dow = weekdayOf(today);
  if (dow !== 1 && dow !== 2) {
    await createHabit(OWNER, {
      title: `${FIXTURE_PREFIX}quota`,
      domain: "gym",
      schedule: { type: "times_per_week", times: 2 },
    });
    overview = await listHabitsWithStats(OWNER, today);
    let quota = overview.habits.find((h) => h.title === `${FIXTURE_PREFIX}quota`)!;
    await setHabitCompletion(OWNER, quota.id, today, true);
    await setHabitCompletion(OWNER, quota.id, addDaysISO(today, -1), true);
    overview = await listHabitsWithStats(OWNER, today);
    quota = overview.habits.find((h) => h.id === quota.id)!;
    check("times_per_week: quota met → streak 1", quota.streak === 1, `got ${quota.streak}`);
    check("times_per_week: adherence capped at target (100%)", quota.adherence7 === 100, `got ${quota.adherence7}`);
  } else {
    console.log("SKIP  times_per_week fixture (today is Mon/Tue — fixture would straddle weeks)");
  }

  check(
    "habit order: scheduled-today first",
    overview.habits.every(
      (h, i, a) => i === 0 || Number(a[i - 1].scheduledToday) >= Number(h.scheduledToday),
    ),
  );

  // report (not assert — live data may include real usage) current seeded values
  console.log("      current habit stats (informational):");
  for (const h of overview.habits.filter((x) => !x.title.startsWith(FIXTURE_PREFIX))) {
    console.log(
      `        ${h.title.padEnd(28)} streak ×${h.streak} · 7d ${h.adherence7}% · ${h.scheduleLabel}`,
    );
  }

  // ==================== TASK EDIT + ARCHIVE (DB) =============================
  const editTask = await createTask(OWNER, {
    title: `${FIXTURE_PREFIX}edit-me`, domain: "personal", dueDate: today, priority: 3, recurrence: null,
  });
  await updateTask(OWNER, editTask.id, {
    title: `${FIXTURE_PREFIX}edited`, notes: "note text", domain: "work",
    dueDate: addDaysISO(today, 5), priority: 1, recurrence: "FREQ=WEEKLY;BYDAY=SU",
  });
  const td = await getTask(OWNER, editTask.id);
  check(
    "task edit: every FR-PERS.1 field updated",
    td?.title === `${FIXTURE_PREFIX}edited` && td?.notes === "note text" &&
      td?.domain === "work" && td?.dueDate === addDaysISO(today, 5) &&
      td?.priority === 1 && td?.recurrence === "FREQ=WEEKLY;BYDAY=SU",
    JSON.stringify(td),
  );
  await updateTask(FOREIGN, editTask.id, {
    title: "hijacked", notes: null, domain: "gym", dueDate: null, priority: 2, recurrence: null,
  });
  check("scoping: foreign updateTask inert", (await getTask(OWNER, editTask.id))?.title === `${FIXTURE_PREFIX}edited`);

  await archiveTask(OWNER, editTask.id);
  check("task archive: gone from list", !(await listTasks(OWNER)).some((t) => t.id === editTask.id));
  check("task archive: getTask returns null", (await getTask(OWNER, editTask.id)) === null);
  const [archivedTaskRow] = await udb.select(tasks, { where: eq(tasks.id, editTask.id) });
  check("task archive: row retained in DB (archived=true)", archivedTaskRow?.archived === true);

  // ==================== HABIT EDIT: TITLE-ONLY (no since) =====================
  await createHabit(OWNER, { title: `${FIXTURE_PREFIX}title-edit`, domain: "personal", schedule: { type: "daily" } });
  let te = (await listHabitsWithStats(OWNER, today)).habits.find((h) => h.title === `${FIXTURE_PREFIX}title-edit`)!;
  await setHabitCompletion(OWNER, te.id, today, true);
  await setHabitCompletion(OWNER, te.id, addDaysISO(today, -1), true);
  await updateHabit(OWNER, te.id, { title: `${FIXTURE_PREFIX}title-edited`, domain: "personal", schedule: null, today });
  const teDetail = await getHabit(OWNER, te.id);
  check(
    "habit title edit: title changed, schedule shape kept, no since stamped",
    teDetail?.title === `${FIXTURE_PREFIX}title-edited` &&
      teDetail?.schedule.type === "daily" && teDetail?.schedule.since === undefined,
    JSON.stringify(teDetail),
  );
  te = (await listHabitsWithStats(OWNER, today)).habits.find((h) => h.id === te.id)!;
  check("habit title edit: streak preserved (2)", te.streak === 2, `got ${te.streak}`);

  // ==================== HABIT EDIT: SCHEDULE CHANGE (since) ===================
  await createHabit(OWNER, { title: `${FIXTURE_PREFIX}sched-change`, domain: "gym", schedule: { type: "daily" } });
  let scH = (await listHabitsWithStats(OWNER, today)).habits.find((h) => h.title === `${FIXTURE_PREFIX}sched-change`)!;
  for (const off of [0, -1, -2, -3]) await setHabitCompletion(OWNER, scH.id, addDaysISO(today, off), true);
  const logBefore = (await udb.select(habitCompletions, { where: eq(habitCompletions.habitId, scH.id) })).length;

  await updateHabit(OWNER, scH.id, {
    title: `${FIXTURE_PREFIX}sched-change`, domain: "gym",
    schedule: { type: "weekly_days", days: [dayKeyOf(today)] as never }, today,
  });
  const scDetail = await getHabit(OWNER, scH.id);
  check("habit schedule change: since stamped = today", scDetail?.schedule.since === today, JSON.stringify(scDetail?.schedule));
  check("habit schedule change: new type persisted", scDetail?.schedule.type === "weekly_days");
  const logAfter = (await udb.select(habitCompletions, { where: eq(habitCompletions.habitId, scH.id) })).length;
  check("habit schedule change: completion log NOT modified", logAfter === logBefore, `before ${logBefore} after ${logAfter}`);

  scH = (await listHabitsWithStats(OWNER, today)).habits.find((h) => h.id === scH.id)!;
  check("habit schedule change: streak restarts under new schedule (1)", scH.streak === 1, `got ${scH.streak}`);
  check("habit schedule change: adherence counts only since today (100%)", scH.adherence7 === 100, `got ${scH.adherence7}`);

  // ==================== HABIT ARCHIVE (log retained) =========================
  await archiveHabit(OWNER, scH.id);
  check("habit archive: gone from list", !(await listHabitsWithStats(OWNER, today)).habits.some((h) => h.id === scH.id));
  check("habit archive: getHabit returns null", (await getHabit(OWNER, scH.id)) === null);
  const logAfterArchive = (await udb.select(habitCompletions, { where: eq(habitCompletions.habitId, scH.id) })).length;
  check("habit archive: completion log RETAINED for reviews", logAfterArchive === logBefore, `got ${logAfterArchive}`);
  const [archivedHabitRow] = await udb.select(habits, { where: eq(habits.id, scH.id) });
  check("habit archive: row retained (archived=true)", archivedHabitRow?.archived === true);

  // ============================ CLEANUP ========================================
  await udb.delete(tasks, like(tasks.title, `${FIXTURE_PREFIX}%`));
  const fixtureHabits = (await udb.select(habits)).filter((h) =>
    h.title.startsWith(FIXTURE_PREFIX),
  );
  if (fixtureHabits.length) {
    const ids = fixtureHabits.map((h) => h.id);
    await udb.delete(habitCompletions, inArray(habitCompletions.habitId, ids));
    await udb.delete(habits, inArray(habits.id, ids));
  }

  const finalTaskIds = (await listTasks(OWNER)).map((t) => t.id).sort();
  check(
    "leave-no-trace: task list identical to snapshot",
    JSON.stringify(finalTaskIds) === JSON.stringify(initialTaskIds),
  );
  check(
    "leave-no-trace: habit + completion counts restored",
    (await udb.select(habits)).length === initialHabitCount &&
      (await udb.select(habitCompletions)).length === initialCompletionCount,
  );

  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
