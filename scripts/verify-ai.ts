/**
 * AI context-assembler verification (Phase 4 step 1, NFR-1) against the
 * seeded DB. Read-only — assembles payloads, sends NOTHING to any API.
 *
 * The load-bearing assertions: raw journal bodies never appear in the
 * assembled payload by default; including them requires the explicit
 * per-feature opt-in; no database ids (raw rows) ever appear; and the SDK /
 * key boundary holds statically.
 *
 * Usage: npm run test:ai
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : `  ${detail}`}`);
};

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

async function main() {
  const { closeDb, forUser } = await import("@/db");
  const { journalEntries } = await import("@/db/schema");
  const { assembleContext } = await import("@/lib/ai/context");
  const { AI_MODEL, buildAiRequest, SYSTEM_PROMPT } = await import("@/lib/ai/request");
  const { eq } = await import("drizzle-orm");

  const OWNER = process.env.SEED_USER_ID!;
  const FOREIGN = "00000000-0000-0000-0000-00000000dead";

  // ground truth: the actual journal bodies in the DB (via forUser)
  const journalRows = await forUser(OWNER).select(journalEntries, {
    where: eq(journalEntries.archived, false),
  });
  check("precondition: seed has journal entries with real bodies",
    journalRows.length >= 3 && journalRows.every((j) => j.body.length > 20));
  const bodies = journalRows.map((j) => j.body);
  // distinctive fragments that could not appear by coincidence
  const fragments = bodies.map((b) => b.slice(10, 40)).filter((f) => f.length >= 20);

  // --- NFR-1: journal bodies excluded by default --------------------------------
  const ctx = await assembleContext(OWNER, { feature: "chat" });
  const serialized = JSON.stringify(ctx);
  check("default: NO journal body text anywhere in the assembled payload",
    fragments.every((f) => !serialized.includes(f)));
  check("default: payload records journalTextIncluded=false",
    ctx.meta.journalTextIncluded === false && !("entriesLast7" in ctx.journal));
  check("default: journal still contributes mood/energy/tags numbers",
    typeof ctx.journal.daysWithEntryLast7 === "number" &&
      Array.isArray(ctx.journal.recentTags) &&
      ctx.journal.recentTags.length > 0,
    JSON.stringify(ctx.journal));
  check("omitted opt-in field behaves as OFF (no accidental default)",
    !JSON.stringify(await assembleContext(OWNER, { feature: "daily-nudge" })).includes(fragments[0] ?? "@@none@@"));

  // --- NFR-1: opt-in is required AND sufficient ----------------------------------
  const optIn = await assembleContext(OWNER, { feature: "chat", includeJournalText: true });
  const optInSerialized = JSON.stringify(optIn);
  const last7 = bodies.filter((_, i) => {
    const d = journalRows[i].date;
    return d >= new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
  });
  check("opt-in: journal bodies from the last 7 days ARE included",
    optIn.meta.journalTextIncluded === true &&
      (optIn.journal.entriesLast7?.length ?? 0) > 0 &&
      (last7.length === 0 || last7.some((b) => optInSerialized.includes(b.slice(10, 40)))));

  // --- no raw rows: zero database ids in the payload ------------------------------
  check("payload contains NO UUIDs at all (summaries, not rows)",
    !UUID_RE.test(serialized), serialized.match(UUID_RE)?.[0] ?? "");
  check("payload contains no user_id / userId keys",
    !/user_?id/i.test(serialized));

  // --- structured summaries reuse module computations ------------------------------
  check("goals summarized with progress + basis",
    ctx.goals.length >= 10 && ctx.goals.every((g) => typeof g.progressPct === "number" && g.progressBasis.length > 0));
  check("academic pace carried with its stated basis",
    ctx.academic.courses.some((c) => c.paceFlag === "AT RISK" && /DUE TODAY/.test(c.paceBasis)));
  check("budget vs actual summarized per category",
    ctx.budget.categories.length >= 4 && ctx.budget.totalCapAud > 0);
  check("work week hours + wins summarized (15.5 h)",
    ctx.work.weekHoursTotal === 15.5 && ctx.work.recentWins.length > 0);
  check("metrics carry latest value + trend, capped",
    ctx.metrics.length > 0 && ctx.metrics.length <= 20 &&
      ctx.metrics.every((m) => m.latest != null && m.trend.length <= 8));
  check("upcoming events capped and dated",
    ctx.upcomingEvents.length <= 30 && ctx.upcomingEvents.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date)));

  // --- request builder: the EXACT body, current model -------------------------------
  const req = buildAiRequest(ctx, "chat", "Can I afford a new laptop this month?");
  check("request: current Claude model id", req.model === AI_MODEL && AI_MODEL === "claude-opus-4-8", req.model);
  check("request: static system prompt + context + task in user message",
    req.system === SYSTEM_PROMPT &&
      req.messages.length === 1 &&
      req.messages[0].content.includes("<lifeos_context>") &&
      req.messages[0].content.includes("Can I afford a new laptop"));
  check("request: default payload sends no journal bodies either",
    fragments.every((f) => !JSON.stringify(req).includes(f)));

  // --- forUser isolation --------------------------------------------------------------
  const foreign = await assembleContext(FOREIGN, { feature: "chat", includeJournalText: true });
  check("forUser: foreign user assembles an empty context",
    foreign.goals.length === 0 && foreign.upcomingEvents.length === 0 &&
      foreign.journal.daysWithEntryLast7 === 0 && (foreign.journal.entriesLast7?.length ?? 0) === 0);

  // --- static boundary checks -----------------------------------------------------------
  const read = (p: string) => readFileSync(p, "utf8");
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
    );
  const srcFiles = walk("src").filter((f) => /\.(ts|tsx)$/.test(f));

  const sdkImporters = srcFiles.filter((f) => read(f).includes("@anthropic-ai/sdk"));
  check("boundary: only src/lib/ai/client.ts imports the Anthropic SDK",
    sdkImporters.length === 1 && sdkImporters[0].endsWith("src/lib/ai/client.ts"),
    sdkImporters.join(","));

  const keyReaders = srcFiles.filter((f) => read(f).includes("process.env.ANTHROPIC_API_KEY"));
  check("boundary: only client.ts reads ANTHROPIC_API_KEY (server-side env)",
    keyReaders.length === 1 && keyReaders[0].endsWith("src/lib/ai/client.ts"),
    keyReaders.join(","));
  check("boundary: key is never NEXT_PUBLIC_",
    !srcFiles.some((f) => read(f).includes("NEXT_PUBLIC_ANTHROPIC")));
  check("boundary: client.ts is server-only",
    read("src/lib/ai/client.ts").includes('import "server-only"'));

  const aiSources = ["src/lib/ai/context.ts", "src/lib/ai/request.ts", "src/lib/ai/client.ts"].map(read);
  check("read-only layer: ai modules perform no inserts/updates/deletes",
    aiSources.every((s) => !/\.(insert|update|delete)\(/.test(s)));

  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
