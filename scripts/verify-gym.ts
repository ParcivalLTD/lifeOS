/**
 * Gym module verification (FR-GYM.1–4) against the seeded DB. Uses the real
 * data layer; the mutating checks create a session then archive it, so the
 * only residue is one archived session (invisible everywhere).
 *
 * Usage: npm run test:gym
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

async function main() {
  const { closeDb } = await import("@/db");
  const {
    listTemplates, listSessions, listPRs, liftSeries, listLifts,
    weeklyAdherence, thisWeekDays, startSessionFromTemplate, logSet,
    getSession, archiveSession,
  } = await import("@/lib/data/gym");
  const { listEventsInRange } = await import("@/lib/data/events");
  const { epley1RM, bestE1RM, round1 } = await import("@/lib/gym");
  const { todayISO, addDaysISO } = await import("@/lib/dates");

  const OWNER = process.env.SEED_USER_ID!;
  const FOREIGN = "00000000-0000-0000-0000-00000000dead";

  // --- pure e1RM (Epley) -----------------------------------------------------
  check("epley: 1 rep = weight", epley1RM(100, 1) === 100);
  check("epley: 100×5 = 116.7", round1(epley1RM(100, 5)) === 116.7, `${epley1RM(100, 5)}`);
  check("epley: non-positive → 0", epley1RM(0, 5) === 0 && epley1RM(100, 0) === 0);
  check(
    "bestE1RM: max over done sets only",
    bestE1RM([{ kg: 80, reps: 6, done: true }, { kg: 100, reps: 3, done: false }]) === round1(epley1RM(80, 6)),
  );

  // --- FR-GYM.1 templates ----------------------------------------------------
  const templates = await listTemplates(OWNER);
  check("templates: 2 seeded (Upper A, Lower A)", templates.length === 2, `got ${templates.length}`);
  const upper = templates.find((t) => t.name === "Upper A");
  check("template Upper A has Bench Press w/ target", Boolean(upper?.exercises.find((e) => e.name === "Bench Press")?.targetKg), JSON.stringify(upper?.exercises?.[0]));

  // --- templates excluded from calendar --------------------------------------
  const monthEvents = await listEventsInRange(OWNER, addDaysISO(todayISO(), -35), addDaysISO(todayISO(), 8));
  check(
    "calendar excludes templates",
    !monthEvents.some((e) => e.title === "Upper A" || e.title === "Lower A"),
  );
  check("calendar still shows gym sessions", monthEvents.some((e) => e.title.startsWith("Gym —")));

  // --- FR-GYM.2 sessions -----------------------------------------------------
  const sessions = await listSessions(OWNER, 100);
  check("sessions: >= 15 (this week + 7 prior weeks x2)", sessions.length >= 15, `got ${sessions.length}`);
  check("sessions: none are templates", !sessions.some((s) => s.name === "Upper A" && s.exercises.length && !s.total), "");
  check("sessions: ordered newest first", sessions.every((s, i) => i === 0 || sessions[i - 1].dateISO >= s.dateISO));

  // --- FR-GYM.3 PRs + e1RM series --------------------------------------------
  const prs = await listPRs(OWNER);
  const prBy = new Map(prs.map((p) => [p.lift, p.e1rm]));
  check("PRs: 4 lifts", prs.length === 4, `got ${prs.length}: ${prs.map((p) => p.lift).join(",")}`);
  check("PRs: sorted heaviest first (Deadlift)", prs[0]?.lift === "Deadlift", prs[0]?.lift);
  check("PR: Bench Press 95", prBy.get("Bench Press") === 95, `${prBy.get("Bench Press")}`);
  check("PR: Squat 125", prBy.get("Squat") === 125);
  check("PR: Deadlift 155", prBy.get("Deadlift") === 155);
  check("PR: Overhead Press 62.5", prBy.get("Overhead Press") === 62.5);
  const bench = await liftSeries(OWNER, "Bench Press", 8);
  check("liftSeries Bench: 8 points, oldest→newest", bench.length === 8 && bench[0].value === 87.5 && bench[7].value === 95, JSON.stringify(bench.map((p) => p.value)));
  check("listLifts: 4 lifts heaviest-first", (await listLifts(OWNER)).join(",") === "Deadlift,Squat,Bench Press,Overhead Press");

  // --- FR-GYM.4 adherence ----------------------------------------------------
  const weeks = await weeklyAdherence(OWNER, 8);
  check("adherence: 8 weeks", weeks.length === 8);
  const prior = weeks.slice(0, 7);
  check("adherence: prior weeks 2 planned / 2 completed", prior.every((w) => w.planned === 2 && w.completed === 2), JSON.stringify(prior));
  const dows = await thisWeekDays(OWNER);
  check("thisWeekDays: has gym days this week", dows.length >= 1, `got ${dows.length}`);

  // --- scoping ---------------------------------------------------------------
  check("scoping: foreign sees no templates/sessions/PRs",
    (await listTemplates(FOREIGN)).length === 0 &&
    (await listSessions(FOREIGN)).length === 0 &&
    (await listPRs(FOREIGN)).length === 0);

  // --- start session (pre-fill FR-GYM.2) + log set (recompute FR-GYM.3) ------
  const started = await startSessionFromTemplate(OWNER, upper!.id, todayISO());
  check("start session: created from template", Boolean(started) && started!.exercises.length === upper!.exercises.length);
  const benchEx = started!.exercises.findIndex((e) => e.name === "Bench Press");
  check("start session: pre-filled sets, none done", started!.exercises[benchEx].sets.length >= 1 && started!.total > 0 && started!.done === 0);
  check("start session: pre-fill weight from last logged (82.5)", started!.exercises[benchEx].sets[0].kg === 82.5, `${started!.exercises[benchEx].sets[0].kg}`);

  // log a heavy bench single → e1RM PR jumps; metric datapoint added
  await logSet(OWNER, started!.id, benchEx, 0, { kg: 100, reps: 1, done: true });
  const after = await getSession(OWNER, started!.id);
  check("log set: marked done, counts update", after!.done === 1, `${after!.done}`);
  const prAfter = (await listPRs(OWNER)).find((p) => p.lift === "Bench Press")?.e1rm;
  check("log set: recompute lifts Bench PR to 100", prAfter === 100, `${prAfter}`);
  // un-done removes this session's contribution → PR back to 95
  await logSet(OWNER, started!.id, benchEx, 0, { done: false });
  const prReverted = (await listPRs(OWNER)).find((p) => p.lift === "Bench Press")?.e1rm;
  check("un-log set: PR reverts to 95 (session point cleared)", prReverted === 95, `${prReverted}`);

  await archiveSession(OWNER, started!.id);
  check("cleanup: session archived, gone from list", !(await listSessions(OWNER, 200)).some((s) => s.id === started!.id));

  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
