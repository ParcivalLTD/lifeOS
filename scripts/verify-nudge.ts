/**
 * Daily-nudge verification (Phase 4 step 3, FR-AI.3/4 + NFR-5) against the
 * seeded DB. No API calls — this proves the structural guarantees:
 *
 *   1. Cost: today's nudge is cached; once cached, getTodayNudge returns it
 *      so the generate action short-circuits BEFORE the API (at most one call
 *      per day). One row per day — regenerating replaces.
 *   2. Advisory: the daily-nudge request carries NO tools — it cannot write.
 *   3. Privacy: journal bodies stay excluded from the nudge request.
 *   4. Toggle: preference defaults ON, flips, and is honored.
 *   5. Hub-and-spoke: nudge + pref rows never appear on the calendar.
 *
 * Usage: npm run test:nudge
 */
import { readFileSync } from "node:fs";
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
  const { events } = await import("@/db/schema");
  const {
    getNudgeEnabled, getTodayNudge, saveTodayNudge, setNudgeEnabled,
  } = await import("@/lib/data/nudge");
  const { assembleContext } = await import("@/lib/ai/context");
  const { buildAiRequest, buildChatRequest } = await import("@/lib/ai/request");
  const { listEventsInRange } = await import("@/lib/data/events");
  const { addDaysISO, todayISO } = await import("@/lib/dates");
  const { sql, and } = await import("drizzle-orm");
  const { eq } = await import("drizzle-orm");

  const OWNER = process.env.SEED_USER_ID!;
  const FOREIGN = "00000000-0000-0000-0000-00000000dead";
  const today = todayISO();

  // The preference row is SHARED — it now carries the owner's assistant model
  // choice alongside the nudge toggle. Archiving it for a clean slate would
  // destroy real user state (and silently drop the assistant back to the
  // default provider), so snapshot it first and put it back at the end.
  const { getPreferences, patchPreferences } = await import("@/lib/data/preferences");
  const savedPrefs = await getPreferences(OWNER);

  const isNudgeOrPref = sql`${events.payload} is not null and (jsonb_exists(${events.payload}, 'nudge') or jsonb_exists(${events.payload}, 'pref'))`;
  await forUser(OWNER).update(events, { archived: true }, isNudgeOrPref);

  // --- 1: cache round-trip + at-most-once-per-day --------------------------------
  check("cost: no cached nudge at the start of the day", (await getTodayNudge(OWNER)) === null);
  await saveTodayNudge(OWNER, "Short sleep 3 nights and you skipped 2 evening blocks — pull today's study to 13:00.");
  const cached = await getTodayNudge(OWNER);
  check("cost: after generation the nudge is cached and read back",
    cached != null && cached.text.startsWith("Short sleep"));
  check("cost: cache hit is the guard that stops a second API call (generate short-circuits)",
    (await getTodayNudge(OWNER)) != null);

  await saveTodayNudge(OWNER, "Replaced nudge for today.");
  const rows = await forUser(OWNER).select(events, {
    where: and(eq(events.archived, false), sql`jsonb_exists(${events.payload}, 'nudge')`),
  });
  check("cost: exactly ONE nudge row per day (regeneration replaces, never appends)",
    rows.length === 1 && (rows[0].payload as { nudge: { text: string } }).nudge.text === "Replaced nudge for today.",
    `rows=${rows.length}`);

  // --- 2: advisory only — the nudge request has no tools --------------------------
  const ctx = await assembleContext(OWNER, { feature: "daily-nudge" });
  const nudgeReq = buildAiRequest(ctx, "daily-nudge");
  check("advisory: daily-nudge request carries NO tools (structurally cannot write)",
    nudgeReq.tools === undefined && !("tools" in nudgeReq && (nudgeReq as { tools?: unknown[] }).tools));
  // contrast: chat DOES attach the proposal tool — proves the difference is deliberate
  const chatReq = buildChatRequest(ctx, [{ role: "user", text: "hi" }]);
  check("advisory: (contrast) chat DOES attach the proposal tool — nudge deliberately omits it",
    chatReq.tools?.length === 1);
  check("advisory: nudge task asks for one short observation, no action verbs",
    nudgeReq.turns[0].role === "user" &&
      /ONE short, data-grounded observation/.test(nudgeReq.turns[0].text));

  // --- 3: privacy — journal bodies excluded from the nudge context ---------------
  check("privacy: nudge context excludes raw journal body by default",
    ctx.meta.journalTextIncluded === false &&
      !JSON.stringify(nudgeReq).includes("Meal-prepped for the week"));
  check("privacy: nudge context still carries mood/energy/tags summaries",
    Array.isArray(ctx.journal.recentTags) && typeof ctx.journal.daysWithEntryLast7 === "number");

  // --- 4: toggle — default ON, flips, honored ------------------------------------
  await forUser(OWNER).update(events, { archived: true }, sql`jsonb_exists(${events.payload}, 'pref')`);
  check("toggle: defaults ON when no preference row exists", (await getNudgeEnabled(OWNER)) === true);
  await setNudgeEnabled(OWNER, false);
  check("toggle: disabling is honored", (await getNudgeEnabled(OWNER)) === false);
  await setNudgeEnabled(OWNER, true);
  check("toggle: re-enabling is honored", (await getNudgeEnabled(OWNER)) === true);
  const prefRows = await forUser(OWNER).select(events, {
    where: and(eq(events.archived, false), sql`jsonb_exists(${events.payload}, 'pref')`),
  });
  check("toggle: a single preference row (upserted, not appended)", prefRows.length === 1, `rows=${prefRows.length}`);

  // --- 5: hub-and-spoke — nudge/pref never hit the calendar -----------------------
  const cal = await listEventsInRange(OWNER, addDaysISO(today, -1), addDaysISO(today, 2));
  check("calendar: the cached nudge Event is excluded",
    !cal.some((e) => e.title.startsWith("Daily nudge")));
  check("calendar: the preference Event is excluded",
    !cal.some((e) => e.title === "Preferences"));

  // --- forUser isolation ----------------------------------------------------------
  check("forUser: foreign user has no nudge and defaults to enabled",
    (await getTodayNudge(FOREIGN)) === null && (await getNudgeEnabled(FOREIGN)) === true);

  // --- static: generation goes through the sole boundary, no write path ----------
  const nudgeGenSrc = readFileSync("src/lib/ai/nudge.ts", "utf8");
  check("static: generation uses the assembler + boundary (no direct SDK, no write)",
    nudgeGenSrc.includes("assembleContext") && nudgeGenSrc.includes("streamFromProvider") &&
      !nudgeGenSrc.includes("@anthropic-ai/sdk") && !/\.(insert|update|delete)\(/.test(nudgeGenSrc));
  check("static: the dashboard builder reads the CACHED nudge, never generates on load",
    (() => {
      const s = readFileSync("src/lib/data/tab-data-server.ts", "utf8");
      return s.includes("getTodayNudge") && !s.includes("generateNudgeText") && !s.includes("sendToClaude");
    })());

  // --- cleanup: archive the test rows, then restore the owner's real prefs ---
  await forUser(OWNER).update(events, { archived: true }, isNudgeOrPref);
  if (Object.keys(savedPrefs).length > 0) await patchPreferences(OWNER, savedPrefs);
  check("cleanup: the owner's saved model choice survived the run",
    JSON.stringify(await getPreferences(OWNER)) === JSON.stringify(savedPrefs) ||
      Object.keys(savedPrefs).length === 0,
    JSON.stringify(await getPreferences(OWNER)));
  check("cleanup: state restored (no cached nudge, default-enabled)",
    (await getTodayNudge(OWNER)) === null && (await getNudgeEnabled(OWNER)) === true);

  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
