/**
 * Sleep analysis verification (stage 4).
 *
 * Mostly PURE tests over lib/sleep.ts — constructed nights with known
 * answers — plus a DB-level pass asserting the assembled healthOverview
 * stays honest for a user with no data (nulls + reasons, never guesses).
 *
 * The honesty rule is the test target: every figure must carry a basis, and
 * anything unsupported must be null WITH the reason (insufficient nights,
 * manual-only clock times, sub-threshold differences).
 *
 * Usage: npm run test:sleep
 */
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

const req = createRequire(import.meta.url);
const so = req.resolve("server-only");
req.cache[so] = { id: so, filename: so, loaded: true, exports: {} } as NodeJS.Module;

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : `  ${detail}`}`);
};

async function main() {
  const {
    circularSdMinutes, consistency, durationTrend, patternFlags,
    stageBalance, SHORT_NIGHT_HOURS,
  } = await import("@/lib/sleep");
  const { addDaysISO } = await import("@/lib/dates");
  type Night = import("@/lib/sleep").SleepNightData;
  type Outcome = import("@/lib/sleep").DayOutcome;

  const TODAY = "2026-07-21";
  const day = (offset: number) => addDaysISO(TODAY, offset);
  const night = (offset: number, over: Partial<Night> = {}): Night => ({
    dateISO: day(offset),
    hours: 7.5,
    deepMin: null,
    remMin: null,
    lightMin: null,
    awakeMin: null,
    wakeAt: null,
    ...over,
  });

  // ---- duration trend ---------------------------------------------------------
  const trendNights = [night(0, { hours: 8 }), night(-1, { hours: 6 }), night(-10, { hours: 4 })];
  const trend = durationTrend(trendNights, TODAY, addDaysISO);
  check("trend: 7d avg uses only the 7-day window (8h+6h → 7h)",
    trend.avg7.value === 7 && trend.avg7.basis.includes("2 nights"));
  check("trend: 30d avg includes the older night (6h avg of 3)",
    trend.avg30.value === 6 && trend.avg30.basis.includes("3 nights"));
  const emptyTrend = durationTrend([], TODAY, addDaysISO);
  check("trend: no data → null value + a basis SAYING there is no data",
    emptyTrend.avg7.value === null && /no nights/.test(emptyTrend.avg7.basis));

  // ---- circular clock math ------------------------------------------------------
  check("circular: identical times → 0 spread", Math.round(circularSdMinutes([420, 420, 420])) === 0);
  const acrossMidnight = circularSdMinutes([23 * 60 + 30, 0 * 60 + 30, 23 * 60 + 45, 0 * 60 + 15]);
  check("circular: bed times straddling midnight read as ~30min spread, not ~12h",
    acrossMidnight > 5 && acrossMidnight < 60, `got ${acrossMidnight}`);

  // ---- consistency ---------------------------------------------------------------
  const manualOnly = Array.from({ length: 10 }, (_, i) => night(-i));
  const cManual = consistency(manualOnly);
  check("consistency: manual-only nights → null, basis says clock times are missing",
    cManual.wakeSdMin === null && /manual logs carry no clock time/.test(cManual.basis));

  const timed = Array.from({ length: 6 }, (_, i) =>
    night(-i, { hours: 7, awakeMin: 30, wakeAt: `${day(-i)}T07:0${i}:00` }),
  );
  const cTimed = consistency(timed);
  check("consistency: synced nights yield tight wake spread (±minutes, not null)",
    cTimed.wakeSdMin !== null && cTimed.wakeSdMin <= 5 && cTimed.nights === 6);
  check("consistency: bed time is derived and stated in the basis",
    cTimed.bedSdMin !== null && /wake − \(asleep \+ awake\)/.test(cTimed.basis));

  // ---- stage balance ---------------------------------------------------------------
  const staged = [
    night(0, { deepMin: 80, remMin: 90, lightMin: 250 }),
    night(-1, { deepMin: 70, remMin: 100, lightMin: 240 }),
    night(-2, { deepMin: 90, remMin: 80, lightMin: 260 }),
  ];
  const sb = stageBalance(staged);
  check("stages: three staged nights → averages vs reference ranges",
    sb.stages !== null && sb.stages.length === 3 && sb.basis.includes("not a score"));
  const deepRow = sb.stages?.find((s) => s.key === "deep");
  const totalPct = (sb.stages ?? []).reduce((s, x) => s + x.avgPct, 0);
  check("stages: proportions are shares of stage minutes (≈100% across deep/REM/light)",
    Math.abs(totalPct - 100) <= 2 && deepRow !== undefined && deepRow.avgPct === 19,
    `total=${totalPct} deep=${deepRow?.avgPct}`);
  check("stages: deep 19% sits inside the 13–23% reference band",
    deepRow?.within === true);
  const sbThin = stageBalance(staged.slice(0, 2));
  check("stages: <3 staged nights → null with the count in the basis",
    sbThin.stages === null && sbThin.basis.includes("2 available"));

  // ---- pattern flags -----------------------------------------------------------------
  const shortN = Array.from({ length: 5 }, (_, i) => night(-i * 2, { hours: 5.5 }));
  const okN = Array.from({ length: 5 }, (_, i) => night(-(i * 2 + 1), { hours: 8 }));
  const outcomes: Outcome[] = [
    // after short nights: 1/4 habits done, gym skipped
    ...shortN.map((n) => ({ dateISO: n.dateISO, habitsScheduled: 4, habitsDone: 1, gymDone: false })),
    // after adequate nights: 4/4 habits done, gym done
    ...okN.map((n) => ({ dateISO: n.dateISO, habitsScheduled: 4, habitsDone: 4, gymDone: true })),
  ];
  const flagged = patternFlags([...shortN, ...okN], outcomes);
  check("patterns: a real 75pp habit gap over 5v5 days IS flagged, with day counts in the basis",
    flagged.flags.some((f) => /Habit completion drops/.test(f.text) && /5d/.test(f.basis)));
  check("patterns: the workout gap is flagged from the gym module's own adherence data",
    flagged.flags.some((f) => /Workouts get skipped/.test(f.text)));
  check(`patterns: the short-night threshold (<${SHORT_NIGHT_HOURS}h) is stated in the basis`,
    flagged.flags.every((f) => f.basis.includes(`<${SHORT_NIGHT_HOURS}h`)));

  // 8 nights total (past the volume gate) but only 3 short → contrast gate
  const thin = patternFlags([...shortN.slice(0, 3), ...okN], outcomes);
  check("patterns: too few short nights → NO flag, note says exactly why",
    thin.flags.length === 0 && /not enough contrast/.test(thin.note ?? ""));

  // 90% vs 100% habits, identical gym: real data, gap below the 20pp bar
  const weakOutcomes: Outcome[] = [
    ...shortN.map((n) => ({ dateISO: n.dateISO, habitsScheduled: 10, habitsDone: 9, gymDone: true })),
    ...okN.map((n) => ({ dateISO: n.dateISO, habitsScheduled: 10, habitsDone: 10, gymDone: true })),
  ];
  const weak = patternFlags([...shortN, ...okN], weakOutcomes);
  check("patterns: a 10pp gap below the 20pp bar is NOT flagged; note names the gap",
    weak.flags.length === 0 && /below the 20pp bar/.test(weak.note ?? ""));

  const noData = patternFlags([night(0), night(-1)], []);
  check("patterns: near-zero sleep data → 'not enough sleep data' note",
    noData.flags.length === 0 && /not enough sleep data/.test(noData.note ?? ""));

  // ---- assembled result over the real data layer --------------------------------------
  const { healthOverview } = await import("@/lib/data/health");
  const { closeDb } = await import("@/db");

  // a user id with zero rows: the assembled analysis must be all honest nulls
  const emptyUser = randomUUID();
  const emptyOv = await healthOverview(emptyUser);
  const ea = emptyOv.sleepAnalysis;
  check("assembled: empty user → no fabricated figures anywhere",
    ea.trend.avg7.value === null && ea.consistency.wakeSdMin === null &&
      ea.stages.stages === null && ea.patterns.flags.length === 0);
  check("assembled: every empty figure still carries a reason",
    ea.trend.avg7.basis.length > 0 && ea.consistency.basis.length > 0 &&
      ea.stages.basis.length > 0 && (ea.patterns.note ?? "").length > 0);

  // the owner: whatever the data says, basis strings must exist and no value
  // may appear without one
  const OWNER = process.env.SEED_USER_ID!;
  const ov = await healthOverview(OWNER);
  const a = ov.sleepAnalysis;
  check("assembled: owner analysis carries bases for all four sections",
    [a.trend.avg7.basis, a.trend.avg30.basis, a.consistency.basis, a.stages.basis]
      .every((b) => typeof b === "string" && b.length > 0) &&
      (a.patterns.flags.length > 0 || (a.patterns.note ?? "").length > 0));
  check("assembled: manual (native) sleep rows never contribute clock times",
    a.consistency.wakeSdMin === null
      ? /manual|synced/.test(a.consistency.basis)
      : a.consistency.basis.includes("synced nights"));

  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
