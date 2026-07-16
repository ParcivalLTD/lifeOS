/**
 * Goal-engine verification (FR-GOAL.1–4) against the seeded DB. Mutating
 * checks create then clean up; re-run `npm run db:seed` afterwards.
 *
 * Usage: npm run test:goals
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
  const { closeDb, forUser } = await import("@/db");
  const { goals, links } = await import("@/db/schema");
  const { eq, and } = await import("drizzle-orm");
  const g = await import("@/lib/data/goals");
  const { parseTarget, metricProgressPct } = await import("@/lib/goals");

  const OWNER = process.env.SEED_USER_ID!;
  const FOREIGN = "00000000-0000-0000-0000-00000000dead";
  const idByTitle = new Map((await forUser(OWNER).select(goals)).map((r) => [r.title, r.id]));
  const id = (t: string) => idByTitle.get(t)!;

  // --- pure ------------------------------------------------------------------
  check("parseTarget: largest number, commas stripped", parseTarget("Save A$12,000 deposit by 2026") === 12000);
  check("parseTarget: ignores small ('1 rep at 100 kg')", parseTarget("1 clean rep at 100 kg") === 100);
  check("metricProgress higher-better 78.4/80 = 98", metricProgressPct(78.4, 80, "higher-better") === 98);
  check("metricProgress lower-better under target = 100", metricProgressPct(148.5, 200, "lower-better") === 100);

  // --- FR-GOAL.2 by horizon --------------------------------------------------
  const byHorizon = await g.goalsByHorizon(OWNER);
  check("grouped into 4 horizons", byHorizon.map((h) => h.horizon).join(",") === "life,yearly,quarterly,monthly", byHorizon.map((h) => h.horizon).join(","));
  const counts = Object.fromEntries(byHorizon.map((h) => [h.horizon, h.goals.length]));
  check("horizon counts life3/yearly4/quarterly3/monthly1", counts.life === 3 && counts.yearly === 4 && counts.quarterly === 3 && counts.monthly === 1, JSON.stringify(counts));
  const allGoals = byHorizon.flatMap((h) => h.goals);
  check("11 active goals total", allGoals.length === 11, `${allGoals.length}`);
  check("every pct in [0,100]", allGoals.every((x) => x.pct >= 0 && x.pct <= 100));
  const byTitle = new Map(allGoals.map((x) => [x.title, x]));

  // --- FR-GOAL.3 progress bases (honest, computed) ---------------------------
  check("Strong-for-life: milestone rollup basis", byTitle.get("Strong and pain-free for life")?.basis === "milestones", byTitle.get("Strong and pain-free for life")?.basis);
  check("Bench 100kg: metric signal, pct high (metric 95)", (byTitle.get("Bench press 100 kg")?.pct ?? 0) > 50, `${byTitle.get("Bench press 100 kg")?.pct}`);
  check("Eating out: metric+habit basis, on-track pct", (byTitle.get("Eating out < A$200 / month")?.pct ?? 0) >= 50);
  check("Run 10k (no data linked): 0%", byTitle.get("Run 10 k under 50:00")?.pct === 0, `${byTitle.get("Run 10 k under 50:00")?.pct}`);

  // --- goal detail -----------------------------------------------------------
  const strong = await g.getGoalDetail(OWNER, id("Strong and pain-free for life"));
  check("detail: children include Bench + Run + monthly sessions", (strong?.children.length ?? 0) >= 3, `${strong?.children.length}`);
  check("detail: linked habit (Morning mobility) with adherence", strong?.habits.some((h) => h.title.startsWith("Morning mobility")) === true);
  const bench = await g.getGoalDetail(OWNER, id("Bench press 100 kg"));
  check("detail: linked metric Bench Press e1RM w/ current+target+trend", Boolean(bench?.metrics.find((m) => m.name === "Bench Press e1RM" && m.current === 95 && m.target === 100 && m.trend.length === 8)), JSON.stringify(bench?.metrics.map((m) => ({ n: m.name, c: m.current, t: m.target, tr: m.trend.length }))));
  check("detail: Bench —supports→ Strong cross-link (out)", bench?.crossLinks.some((l) => l.relation === "supports" && l.title === "Strong and pain-free for life" && l.direction === "out") === true);
  check("detail: Strong has incoming supports link", strong?.crossLinks.some((l) => l.relation === "supports" && l.direction === "in") === true);

  // --- FR-FIN.3 funds→ wiring (savings event → life goal) --------------------
  const funds = await g.savingsFundsGoals(OWNER);
  const houseFund = [...funds.values()].find((v) => v.title === "Long-term financial security");
  check("savings House deposit funds→ Long-term financial security", Boolean(houseFund));
  const finsec = await g.getGoalDetail(OWNER, id("Long-term financial security"));
  check("detail: Long-term financial security funded by House deposit (61%)", finsec?.savings.some((s) => s.name === "House deposit" && s.pct === 61) === true, JSON.stringify(finsec?.savings));

  // --- scoping ---------------------------------------------------------------
  check("scoping: foreign sees no goals", (await g.goalsByHorizon(FOREIGN)).length === 0 && (await g.getGoalDetail(FOREIGN, id("Bench press 100 kg"))) === null);

  // --- FR-GOAL.1 + FR-GOAL.4 mutations ---------------------------------------
  const newId = await g.createGoal(OWNER, {
    title: "__verify__ read 50 books", description: null, domain: "personal",
    horizon: "yearly", parentGoalId: null, targetDate: null,
    successCriteria: "50 books finished", status: "active",
  });
  check("create goal: appears active", (await g.goalsByHorizon(OWNER)).flatMap((h) => h.goals).some((x) => x.id === newId));

  await g.createGoalLink(OWNER, { fromId: newId, toId: id("Build a career as an ML engineer"), relation: "supports", domain: "personal" });
  const nd = await g.getGoalDetail(OWNER, newId);
  check("create cross-link: supports Career (out)", nd?.crossLinks.some((l) => l.relation === "supports" && l.direction === "out") === true);

  await g.setHabitGoal(OWNER, (await g.goalHabitOptions(OWNER)).find((h) => h.title === "Read 20 min")!.id, newId);
  check("attach habit: Read 20 min now a recurring action", (await g.getGoalDetail(OWNER, newId))?.habits.some((h) => h.title === "Read 20 min") === true);

  // change House deposit funds→ to the new goal then back
  const houseSavingId = [...funds.entries()].find(([, v]) => v.title === "Long-term financial security")![0];
  await g.setSavingsFundsGoal(OWNER, houseSavingId, newId);
  check("re-point funds→: House deposit now funds new goal", (await g.savingsFundsGoals(OWNER)).get(houseSavingId)?.goalId === newId);

  // cleanup
  await forUser(OWNER).delete(links, and(eq(links.fromId, newId)));
  await forUser(OWNER).delete(links, and(eq(links.toId, newId)));
  await g.setSavingsFundsGoal(OWNER, houseSavingId, id("Long-term financial security"));
  await g.setHabitGoal(OWNER, (await g.goalHabitOptions(OWNER)).find((h) => h.title === "Read 20 min")!.id, null);
  await forUser(OWNER).delete(goals, eq(goals.id, newId));
  check("cleanup: new goal removed", !(await g.goalsByHorizon(OWNER)).flatMap((h) => h.goals).some((x) => x.id === newId));

  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
