/**
 * Work module verification (FR-WORK.1–4) against the seeded DB. Uses the real
 * data layer; mutating checks create a throwaway project + achievement,
 * exercise time tracking (quick entry + timer) and archive — residue is
 * archived rows only.
 *
 * Usage: npm run test:work
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { closeDb } = await import("@/db");
  const { achievementDate, achievementsText, elapsedHours, round2 } = await import("@/lib/work");
  const {
    addAchievement, archiveAchievement, archiveProject, createProject,
    getProject, listAchievements, listProjects, logProjectTime, toggleTimer,
    weeklyHours, workOverview,
  } = await import("@/lib/data/work");
  const { listEventsInRange } = await import("@/lib/data/events");
  const { addDaysISO, todayISO } = await import("@/lib/dates");

  const OWNER = process.env.SEED_USER_ID!;
  const FOREIGN = "00000000-0000-0000-0000-00000000dead";
  const today = todayISO();

  // --- pure helpers ------------------------------------------------------------
  check("achievementDate: JUL 9 style", achievementDate("2026-07-09") === "JUL 9 2026");
  const txt = achievementsText([
    { dateISO: "2026-07-09", title: "Led incident response", context: "Atlas" },
    { dateISO: "2026-06-30", title: "No-context win", context: null },
  ]);
  check("achievementsText: mockup line format, newline-joined",
    txt === "JUL 9 2026 — Led incident response (Atlas)\nJUN 30 2026 — No-context win", JSON.stringify(txt));
  check("round2", round2(11.456) === 11.46);
  const started = new Date(Date.now() - 90 * 60_000).toISOString();
  check("elapsedHours: 90 min → 1.5 h", elapsedHours(started, new Date()) === 1.5);
  check("elapsedHours: floor at one-minute-ish, never 0",
    elapsedHours(new Date().toISOString(), new Date()) === 0.02);

  // --- seed: projects (FR-WORK.2) -------------------------------------------------
  const projects = await listProjects(OWNER);
  check("seed: two projects, deadline order", projects.length === 2 && projects[0].title === "Atlas API migration",
    projects.map((p) => p.title).join(","));
  const overview = await workOverview(OWNER);
  const atlas = overview.projects.find((p) => p.title === "Atlas API migration")!;
  const lifeos = overview.projects.find((p) => p.title === "LifeOS Phase 1")!;
  check("projects: next action = top open task on the project goal",
    atlas.next?.title === "Finish auth middleware tests", `${atlas.next?.title}`);
  check("projects: done/total from goal-linked tasks (3/5 and 1/3)",
    atlas.tasksDone === 3 && atlas.tasksTotal === 5 && lifeos.tasksDone === 1 && lifeos.tasksTotal === 3,
    JSON.stringify([atlas.tasksDone, atlas.tasksTotal, lifeos.tasksDone, lifeos.tasksTotal]));
  check("projects: goal titles resolved (cross-domain LifeOS → personal goal)",
    atlas.goalTitle === "Atlas API migration shipped" && lifeos.goalTitle === "Ship LifeOS Phase 1");

  // --- FR-WORK.4: time tracking -----------------------------------------------------
  check("time: weekly hours per project (11.5 / 4)",
    atlas.weekHours === 11.5 && lifeos.weekHours === 4, JSON.stringify([atlas.weekHours, lifeos.weekHours]));
  check("time: week total line (15.5 h across 2 projects)",
    overview.weekTotal.hours === 15.5 && overview.weekTotal.projects === 2, JSON.stringify(overview.weekTotal));

  // --- FR-WORK.3: achievements -------------------------------------------------------
  check("achievements: seeded wins newest-first with context",
    overview.achievements.length === 4 &&
      overview.achievements[0].title.startsWith("Led incident response") &&
      overview.achievements[0].context === "Atlas",
    JSON.stringify(overview.achievements.map((a) => a.title.slice(0, 20))));
  const exportTxt = achievementsText(overview.achievements);
  check("achievements: export text has one clean line per win",
    exportTxt.split("\n").length === 4 && /p95 latency down 60% \(Atlas\)/.test(exportTxt));

  // --- hub-and-spoke: calendar shows deadlines, hides achievements --------------------
  const cal = await listEventsInRange(OWNER, addDaysISO(today, -60), addDaysISO(today, 30));
  check("calendar: project deadline visible (kind=deadline)",
    cal.some((e) => e.title === "Atlas API migration" && e.kind === "deadline"));
  check("calendar: achievements excluded",
    !cal.some((e) => e.title.startsWith("Led incident response")));

  // --- mutations: project + time + timer + achievement --------------------------------
  const pid = await createProject(OWNER, { title: "Verify project", dueISO: addDaysISO(today, 7) });
  await logProjectTime(OWNER, pid, 0.5); // quick tap
  await logProjectTime(OWNER, pid, 1); // entries accumulate, never replace
  let hours = await weeklyHours(OWNER, await listProjects(OWNER));
  check("mutations: quick entries accumulate (0.5 + 1 = 1.5)", hours.get(pid) === 1.5, `${hours.get(pid)}`);

  await toggleTimer(OWNER, pid); // start
  const running = await getProject(OWNER, pid);
  check("mutations: timer start stamps the project", running?.timerStartedAt != null);
  await sleep(1100);
  await toggleTimer(OWNER, pid); // stop → logs elapsed (floored at 0.02 h)
  const stopped = await getProject(OWNER, pid);
  hours = await weeklyHours(OWNER, await listProjects(OWNER));
  check("mutations: timer stop clears state and logs an entry",
    stopped?.timerStartedAt == null && (hours.get(pid) ?? 0) >= 1.52, `${hours.get(pid)}`);

  await addAchievement(OWNER, { title: "Verified the Work module", context: "LifeOS", dateISO: today });
  const wins = await listAchievements(OWNER);
  const win = wins.find((a) => a.title === "Verified the Work module");
  check("mutations: achievement logged (today, with context)", win != null && win.context === "LifeOS");

  await archiveProject(OWNER, pid);
  if (win) await archiveAchievement(OWNER, win.id);
  const after = await workOverview(OWNER);
  check("mutations: archives remove project + achievement from views",
    !after.projects.some((p) => p.id === pid) &&
      !after.achievements.some((a) => a.title === "Verified the Work module"));

  // --- forUser isolation ----------------------------------------------------------
  const foreign = await workOverview(FOREIGN);
  check("forUser: foreign user sees nothing",
    foreign.projects.length === 0 && foreign.achievements.length === 0 && foreign.weekTotal.hours === 0);

  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
