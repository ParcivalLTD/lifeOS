/**
 * Review system verification (FR-REV.1–3) against the seeded DB. Uses the
 * real data layer; mutating checks save weekly + monthly reviews for the
 * current periods, then archive them — residue is archived rows only.
 *
 * Usage: npm run test:review
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
  const { monthlyPeriod, quarterlyPeriod, timelineNote, weeklyPeriod } = await import("@/lib/review");
  const {
    archiveReview, getReview, goalsReview, listReviews, saveReview, weeklySummary,
  } = await import("@/lib/data/review");
  const { listEventsInRange } = await import("@/lib/data/events");
  const { listHabitsWithStats } = await import("@/lib/data/habits");
  const { addDaysISO, todayISO } = await import("@/lib/dates");

  const OWNER = process.env.SEED_USER_ID!;
  const FOREIGN = "00000000-0000-0000-0000-00000000dead";
  const today = todayISO();

  // --- pure: periods + timeline notes ------------------------------------------
  const wp = weeklyPeriod("2026-07-08"); // Wed of ISO week 28
  check("weeklyPeriod: key + label + Mon-start range",
    wp.key === "2026-W28" && wp.label === "W28 · JUL 6–12" && wp.fromISO === "2026-07-06" && wp.toISO === "2026-07-12",
    JSON.stringify(wp));
  check("monthlyPeriod / quarterlyPeriod keys",
    monthlyPeriod("2026-07-19").key === "2026-07" && monthlyPeriod("2026-07-19").label === "JULY 2026" &&
      quarterlyPeriod("2026-07-19").key === "2026-Q3" && quarterlyPeriod("2026-07-19").label === "Q3 2026");
  check("timelineNote: completion % from STORED tasks stat",
    timelineNote({ rev: "weekly", periodKey: "x", periodLabel: "x", savedISO: "2026-01-01",
      stats: [{ v: "14/19", l: "tasks done", basis: "b" }], reflections: {} }, today) === "74% COMPLETION");
  check("timelineNote: saved today → COMPLETED TODAY",
    timelineNote({ rev: "weekly", periodKey: "x", periodLabel: "x", savedISO: today, reflections: {} }, today) === "COMPLETED TODAY");
  check("timelineNote: goal review → flagged count",
    timelineNote({ rev: "monthly", periodKey: "x", periodLabel: "x", savedISO: "2026-01-01", reflections: {},
      goals: [
        { id: "1", title: "a", domain: "work", horizon: "yearly", pct: 10, basis: "none", flag: "no-signal", flagBasis: "b" },
        { id: "2", title: "b", domain: "work", horizon: "yearly", pct: 50, basis: "metric", flag: "on-track", flagBasis: "b" },
      ] }, today) === "2 GOALS · 1 FLAGGED");

  // --- FR-REV.1: weekly summary computed from real module data -------------------
  const summary = await weeklySummary(OWNER);
  check("summary: current week period", summary.periodKey === weeklyPeriod(today).key, summary.periodKey);
  check("summary: nine figures, every one with a stated basis",
    summary.stats.length === 9 && summary.stats.every((s) => s.basis.length > 5),
    JSON.stringify(summary.stats.map((s) => s.l)));
  const by = new Map(summary.stats.map((s) => [s.l, s]));
  check("summary: study hours reuse academic actuals (6/9 H)",
    by.get("study hours")?.v === "6/9 H", by.get("study hours")?.v);
  check("summary: work hours reuse work tracking (15.5 H)",
    by.get("work tracked")?.v === "15.5 H", by.get("work tracked")?.v);
  const habits = await listHabitsWithStats(OWNER, today);
  check("summary: habit adherence identical to the Habits module's own figure",
    by.get("habit adherence")?.v === `${habits.adherence7}%`, by.get("habit adherence")?.v);
  check("summary: tasks tile is done/due with honest basis",
    /^\d+\/\d+$/.test(by.get("tasks done")?.v ?? "") && /DUE THIS WEEK/.test(by.get("tasks done")?.basis ?? ""));
  check("summary: workouts tile from gym adherence",
    /^\d+\/\d+$/.test(by.get("workouts")?.v ?? ""));
  check("summary: journal/mood/sleep tiles never fabricate (— when no data)",
    /^\d\/7$/.test(by.get("journal days")?.v ?? "") &&
      (by.get("avg mood")?.v === "—" || /^\d\.\d$/.test(by.get("avg mood")?.v ?? "")) &&
      (by.get("avg sleep")?.v === "—" || /H$/.test(by.get("avg sleep")?.v ?? "")),
    JSON.stringify([by.get("journal days")?.v, by.get("avg mood")?.v, by.get("avg sleep")?.v]));
  check("summary: highlights carry the academic at-risk flag (traceable, not invented)",
    summary.highlights.some((h) => h.includes("COMP3888 AT RISK")), JSON.stringify(summary.highlights));

  // --- FR-REV.2: goal review flags -------------------------------------------------
  const review = await goalsReview(OWNER);
  const flags = new Map(review.goals.map((g) => [g.title, g]));
  check("goals: every active goal snapshotted with a flag basis",
    review.goals.length >= 15 && review.goals.every((g) => g.flagBasis.length > 3), `${review.goals.length}`);
  const capstoneGoal = flags.get("Capstone unit ≥ 75");
  check("goals: academic pace propagates — capstone course goal AT RISK",
    capstoneGoal?.flag === "at-risk" && /ACADEMIC PACE/.test(capstoneGoal?.flagBasis ?? ""),
    JSON.stringify(capstoneGoal));
  check("goals: signal-less goal flagged NO SIGNAL, says why",
    review.goals.some((g) => g.flag === "no-signal" && /NO LINKED/.test(g.flagBasis)));
  check("goals: on-track goals state pct + signal source",
    review.goals.some((g) => g.flag === "on-track" && /VIA (MILESTONES|METRIC|HABITS|SAVINGS)/.test(g.flagBasis)));

  // --- FR-REV.3: seeded timeline -----------------------------------------------------
  const timeline = await listReviews(OWNER);
  check("timeline: three seeded past weeklies, newest first",
    timeline.length === 3 && timeline[0].payload.periodKey > timeline[2].payload.periodKey,
    JSON.stringify(timeline.map((r) => r.payload.periodKey)));
  check("timeline: notes derived from stored snapshots (74/78→81?/68 mockup set)",
    timelineNote(timeline[0].payload, today) === "74% COMPLETION" &&
      timelineNote(timeline[1].payload, today) === "81% COMPLETION" &&
      timelineNote(timeline[2].payload, today) === "68% COMPLETION",
    JSON.stringify(timeline.map((r) => timelineNote(r.payload, today))));

  // --- mutations: save weekly + monthly, replace-on-resave, archive -------------------
  const weeklyId = await saveReview(OWNER, "weekly", { worked: "test", top3: "1. x" });
  let stored = await getReview(OWNER, weeklyId);
  check("save weekly: snapshot stored server-side (stats + highlights + reflections)",
    stored != null && stored.payload.stats?.length === 9 &&
      (stored.payload.highlights?.length ?? 0) > 0 && stored.payload.reflections.worked === "test");
  check("save weekly: timeline notes it as completed today",
    stored != null && timelineNote(stored.payload, today) === "COMPLETED TODAY");

  const weeklyId2 = await saveReview(OWNER, "weekly", { worked: "revised" });
  stored = await getReview(OWNER, weeklyId2);
  const afterResave = await listReviews(OWNER);
  check("save weekly again: REPLACES same period (no duplicate row)",
    weeklyId2 === weeklyId && afterResave.length === 4 && stored?.payload.reflections.worked === "revised",
    `${afterResave.length}`);

  const monthlyId = await saveReview(OWNER, "monthly", { moved: "m", adjust: "a" });
  const monthly = await getReview(OWNER, monthlyId);
  check("save monthly: goal snapshot with flags stored",
    monthly != null && (monthly.payload.goals?.length ?? 0) >= 15 &&
      monthly.payload.goals!.some((g) => g.flag === "at-risk") &&
      monthly.payload.periodKey === monthlyPeriod(today).key);

  const cal = await listEventsInRange(OWNER, addDaysISO(today, -30), addDaysISO(today, 2));
  check("calendar: stored reviews never appear on it",
    !cal.some((e) => e.title.includes("review —") || e.title.includes("Review —")));

  await archiveReview(OWNER, weeklyId);
  await archiveReview(OWNER, monthlyId);
  check("archive: reviews leave the timeline", (await listReviews(OWNER)).length === 3);

  // --- forUser isolation ---------------------------------------------------------
  const foreign = await listReviews(FOREIGN);
  const foreignSummary = await weeklySummary(FOREIGN);
  check("forUser: foreign user sees no reviews; summary computes from nothing",
    foreign.length === 0 && foreignSummary.stats.find((s) => s.l === "tasks done")?.v === "0/0");

  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
