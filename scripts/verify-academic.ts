/**
 * Academic module verification (FR-ACAD.1–4) against the seeded DB. Uses the
 * real data layer; mutating checks create a throwaway course/goal, exercise
 * grading + study logging, then archive — the only residue is archived rows.
 *
 * Usage: npm run test:academic
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
  const { computePace, currentGrade, mean1 } = await import("@/lib/academic");
  const {
    academicOverview, archiveCourse, createAssessment, createCourse,
    listAssessments, listCourses, logStudySession, setGrade, weeklyStudy,
  } = await import("@/lib/data/academic");
  const { listEventsInRange } = await import("@/lib/data/events");
  const { archiveGoal, createGoal, getGoalDetail } = await import("@/lib/data/goals");
  const { addDaysISO, todayISO } = await import("@/lib/dates");

  const OWNER = process.env.SEED_USER_ID!;
  const FOREIGN = "00000000-0000-0000-0000-00000000dead";
  const today = todayISO();

  // --- pure: currentGrade ------------------------------------------------------
  check("currentGrade: null when nothing graded (never 0)",
    currentGrade([{ name: "a", weight: 20, grade: null, dueISO: today }]) === null);
  check("currentGrade: single graded item = its grade",
    currentGrade([{ name: "a", weight: 5, grade: 84, dueISO: today }]) === 84);
  check("currentGrade: weighted mean over graded only",
    currentGrade([
      { name: "a", weight: 10, grade: 80, dueISO: today },
      { name: "b", weight: 30, grade: 60, dueISO: today },
      { name: "c", weight: 60, grade: null, dueISO: today },
    ]) === 65, `${currentGrade([
      { name: "a", weight: 10, grade: 80, dueISO: today },
      { name: "b", weight: 30, grade: 60, dueISO: today },
      { name: "c", weight: 60, grade: null, dueISO: today },
    ])}`);
  check("mean1: null on empty (no fabricated averages)", mean1([]) === null && mean1([1, 2]) === 1.5);

  // --- pure: computePace (FR-ACAD.4 — basis always stated) -----------------------
  const p1 = computePace(null, [{ name: "a", weight: 20, grade: null, dueISO: addDaysISO(today, 5) }], today);
  check("pace: missing target → NO TARGET, says so", p1.flag === "no-target" && /TARGET/.test(p1.basis));
  const p2 = computePace(75, [{ name: "Form", weight: null, grade: null, dueISO: today }], today);
  check("pace: ungraded item due today → AT RISK w/ named item",
    p2.flag === "at-risk" && /DUE TODAY/.test(p2.basis) && /FORM/.test(p2.basis));
  const p3 = computePace(75, [{ name: "a", weight: null, grade: null, dueISO: addDaysISO(today, 3) }], today);
  check("pace: no weighted assessments → NO DATA", p3.flag === "no-data");
  const p4 = computePace(80, [
    { name: "a", weight: 50, grade: 40, dueISO: addDaysISO(today, -9) },
    { name: "b", weight: 50, grade: null, dueISO: addDaysISO(today, 30) },
  ], today);
  check("pace: unreachable target → AT RISK with required avg",
    p4.flag === "at-risk" && /UNREACHABLE/.test(p4.basis) && /120%/.test(p4.basis), p4.basis);
  const p5 = computePace(80, [
    { name: "a", weight: 50, grade: 70, dueISO: addDaysISO(today, -9) },
    { name: "b", weight: 50, grade: null, dueISO: addDaysISO(today, 30) },
  ], today);
  check("pace: needs 90% on remaining → TIGHT", p5.flag === "tight" && /90%/.test(p5.basis), p5.basis);
  const p6 = computePace(70, [
    { name: "a", weight: 50, grade: 70, dueISO: addDaysISO(today, -9) },
    { name: "b", weight: 50, grade: null, dueISO: addDaysISO(today, 30) },
  ], today);
  check("pace: reachable comfortably → ON TRACK", p6.flag === "on-track" && /70%/.test(p6.basis), p6.basis);
  const p7 = computePace(60, [{ name: "a", weight: 40, grade: 70, dueISO: addDaysISO(today, -9) }], today);
  check("pace: all graded, above target → ON TRACK + coverage note",
    p7.flag === "on-track" && /COVER 40%/.test(p7.basis), p7.basis);
  const p8 = computePace(80, [{ name: "a", weight: 100, grade: 70, dueISO: addDaysISO(today, -9) }], today);
  check("pace: all graded, below target → AT RISK", p8.flag === "at-risk");

  // --- seed: courses + overview ---------------------------------------------------
  const courses = await listCourses(OWNER);
  check("seed: three courses, sorted by code",
    courses.length === 3 && courses.map((c) => c.code).join(",") === "COMP3608,COMP3888,MATH3061",
    courses.map((c) => c.code).join(","));
  const capstone = courses.find((c) => c.code === "COMP3888")!;
  check("seed: course fields (target, planned h/wk, semester, goal link)",
    capstone.targetGrade === 75 && capstone.plannedHours === 4 &&
    /^S2 /.test(capstone.semester ?? "") && capstone.goalId != null);

  const overview = await academicOverview(OWNER);
  const oCap = overview.courses.find((c) => c.code === "COMP3888")!;
  const oAI = overview.courses.find((c) => c.code === "COMP3608")!;
  const oGeo = overview.courses.find((c) => c.code === "MATH3061")!;
  check("FR-ACAD.4: capstone AT RISK (form due today, ungraded)",
    oCap.pace.flag === "at-risk" && /DUE TODAY/.test(oCap.pace.basis), oCap.pace.basis);
  check("FR-ACAD.4: AI on track, needed avg stated",
    oAI.pace.flag === "on-track" && /74\.4% AVG ON REMAINING 80%/.test(oAI.pace.basis), oAI.pace.basis);
  check("FR-ACAD.4: Geometry on track", oGeo.pace.flag === "on-track", oGeo.pace.basis);
  check("FR-ACAD.2: current grades from graded work only (84 / 78, capstone null)",
    oAI.currentGrade === 84 && oGeo.currentGrade === 78 && oCap.currentGrade === null);
  check("overview: avg is mean of graded courses w/ explicit basis",
    overview.avg.current === 81 && /2\/3 COURSES GRADED/.test(overview.avg.basis), overview.avg.basis);
  check("overview: pace line names the at-risk course + hours",
    /COMP3888/.test(overview.paceLine) && /2\.5 OF 4 PLANNED HOURS/.test(overview.paceLine), overview.paceLine);
  check("overview: course goal titles resolved", oCap.goalTitle === "Capstone unit ≥ 75", `${oCap.goalTitle}`);

  // --- FR-ACAD.3: planned vs actual study hours -----------------------------------
  const study = await weeklyStudy(OWNER, courses);
  const byCode = new Map(study.map((s) => [s.code, s]));
  check("study: actual hours per course this week (2.5 / 3 / 0.5)",
    byCode.get("COMP3888")?.actual === 2.5 && byCode.get("COMP3608")?.actual === 3 && byCode.get("MATH3061")?.actual === 0.5,
    JSON.stringify(study));
  check("study: planned from course definition", byCode.get("COMP3888")?.planned === 4);

  // --- hub-and-spoke: calendar shows occurrences, hides definitions -----------------
  const cal = await listEventsInRange(OWNER, addDaysISO(today, -15), addDaysISO(today, 2));
  check("calendar: course definitions excluded",
    !cal.some((e) => e.title === "CS Capstone" || e.title === "Intro to AI (Adv)"));
  check("calendar: assessment deadlines visible",
    cal.some((e) => e.kind === "deadline" && e.title === "COMP3888 — Project preference form"));
  check("calendar: study sessions visible",
    cal.some((e) => e.kind === "session" && e.title === "Study — COMP3608"));

  // --- FR-ACAD.1: goal-engine reuse (nesting via parent_goal_id) ---------------------
  const capDetail = await getGoalDetail(OWNER, capstone.goalId!);
  check("course goal exists in the engine", capDetail != null && capDetail.title === "Capstone unit ≥ 75");
  check("course goal nests under the semester goal",
    capDetail?.parent?.title === "Semester: every unit at its target grade", `${capDetail?.parent?.title}`);
  const aiGoalDetail = await getGoalDetail(OWNER, courses.find((c) => c.code === "COMP3608")!.goalId!);
  check("grade metric linked —relates-to→ course goal, progress computed",
    aiGoalDetail != null &&
      aiGoalDetail.metrics.some((m) => m.name === "COMP3608 grade" && m.current === 84) &&
      aiGoalDetail.progress.basis === "metric" && aiGoalDetail.progress.pct === 100,
    JSON.stringify({ basis: aiGoalDetail?.progress, metrics: aiGoalDetail?.metrics.map((m) => m.name) }));

  // --- mutations: course → assessment → grade → metric → study → archive -------------
  const tmpGoalId = await createGoal(OWNER, {
    title: "Verify unit ≥ 65", description: null, domain: "academic", horizon: "quarterly",
    parentGoalId: null, targetDate: null, successCriteria: "Final grade ≥ 65%", status: "active",
  });
  const tmpCourseId = await createCourse(OWNER, {
    code: "VERI101", name: "Verification 101", semester: "S2 2099",
    targetGrade: 65, plannedHours: 1, goalId: tmpGoalId,
  });
  await createAssessment(OWNER, { courseId: tmpCourseId, name: "Checkpoint", weight: 40, dueISO: addDaysISO(today, -1) });
  const tmpAssessment = (await listAssessments(OWNER)).find((a) => a.courseId === tmpCourseId)!;
  check("mutations: assessment created against course", tmpAssessment != null && tmpAssessment.weight === 40);

  const beforeGrade = await academicOverview(OWNER);
  const vBefore = beforeGrade.courses.find((c) => c.id === tmpCourseId)!;
  check("mutations: ungraded overdue → AT RISK (overdue named)",
    vBefore.pace.flag === "at-risk" && /OVERDUE/.test(vBefore.pace.basis), vBefore.pace.basis);

  await setGrade(OWNER, tmpAssessment.id, 72);
  await setGrade(OWNER, tmpAssessment.id, 72); // idempotent recompute
  const afterGrade = await academicOverview(OWNER);
  const vAfter = afterGrade.courses.find((c) => c.id === tmpCourseId)!;
  check("mutations: grade lands, pace recomputed off it",
    vAfter.currentGrade === 72 && vAfter.pace.flag === "on-track", JSON.stringify(vAfter.pace));
  const tmpGoal = await getGoalDetail(OWNER, tmpGoalId);
  check("mutations: grade metric auto-created + auto-linked to course goal",
    tmpGoal != null && tmpGoal.metrics.some((m) => m.name === "VERI101 grade" && m.current === 72),
    JSON.stringify(tmpGoal?.metrics.map((m) => [m.name, m.current])));

  await logStudySession(OWNER, { courseId: tmpCourseId, hours: 1.5, dateISO: today });
  const tmpStudy = await weeklyStudy(OWNER, await listCourses(OWNER));
  check("mutations: study session logged into this week's actuals",
    tmpStudy.find((s) => s.code === "VERI101")?.actual === 1.5);

  await archiveCourse(OWNER, tmpCourseId);
  await archiveGoal(OWNER, tmpGoalId);
  const afterArchive = await listCourses(OWNER);
  check("mutations: archive removes course AND its assessments",
    !afterArchive.some((c) => c.id === tmpCourseId) &&
      !(await listAssessments(OWNER)).some((a) => a.courseId === tmpCourseId));

  // --- forUser isolation -----------------------------------------------------------
  const foreign = await listCourses(FOREIGN);
  const foreignOverview = await academicOverview(FOREIGN);
  check("forUser: foreign user sees no courses, empty overview",
    foreign.length === 0 && foreignOverview.courses.length === 0 && foreignOverview.avg.current === null);

  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
