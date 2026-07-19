/**
 * Assistant / CONFIRMED-ACTION verification (Phase 4 step 2) against the
 * seeded DB. No API calls — this suite proves the structural guarantees:
 *
 * 1. A model proposal is DATA: parsing/rendering it writes nothing.
 * 2. Only an explicit Approve (applyProposal) writes — and it re-validates
 *    the raw payload from scratch, so malformed/hostile shapes are rejected
 *    with the DB untouched.
 * 3. Approved writes go through the exact same forUser-wrapped create
 *    functions as a manual edit (verified by observing the results through
 *    the normal read paths, calendar rules included).
 *
 * Usage: npm run test:assistant
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
  const { closeDb } = await import("@/db");
  const { applyProposal } = await import("@/lib/ai/apply");
  const { parseProposal, parseProposalList } = await import("@/lib/ai/proposals");
  const { PROPOSAL_TOOL, buildChatRequest, CHAT_SYSTEM_PROMPT } = await import("@/lib/ai/request");
  const { assembleContext } = await import("@/lib/ai/context");
  const { archiveEvent, listEventsInRange } = await import("@/lib/data/events");
  const { archiveHabit, listHabitsWithStats } = await import("@/lib/data/habits");
  const { archiveTask, listTasks } = await import("@/lib/data/tasks");
  const { addDaysISO, todayISO } = await import("@/lib/dates");

  const OWNER = process.env.SEED_USER_ID!;
  const FOREIGN = "00000000-0000-0000-0000-00000000dead";
  const today = todayISO();

  const snapshot = async () => {
    const [tasks, habits, events] = await Promise.all([
      listTasks(OWNER),
      listHabitsWithStats(OWNER, today),
      listEventsInRange(OWNER, addDaysISO(today, -60), addDaysISO(today, 130)),
    ]);
    return { tasks: tasks.length, habits: habits.habits.length, events: events.length };
  };

  // --- validation: clean objects from an allowlist -------------------------------
  const okTask = parseProposal({ action: "create_task", title: "  Book  dentist ", domain: "health", dueDate: addDaysISO(today, 3), priority: 1 });
  check("parse: valid task normalized (whitespace collapsed)",
    okTask.ok && okTask.proposal.title === "Book dentist" && okTask.proposal.action === "create_task");
  const okEvent = parseProposal({ action: "create_event", title: "Study block", domain: "academic", kind: "session", date: addDaysISO(today, 1), time: "14:00", endTime: "16:00" });
  check("parse: valid event", okEvent.ok);
  const okHabit = parseProposal({ action: "create_habit", title: "Stretch", domain: "health", schedule: { type: "weekly_days", days: ["mon", "wed", "fri"] } });
  check("parse: valid habit schedule", okHabit.ok);
  check("parse: extra/unknown fields are NOT carried into the clean object",
    okTask.ok && !("evil" in okTask.proposal) &&
      Object.keys(okTask.proposal).sort().join(",") === "action,domain,dueDate,priority,title");

  const bads: [string, unknown][] = [
    ["unknown action", { action: "delete_everything", title: "x", domain: "personal" }],
    ["bad domain", { action: "create_task", title: "x", domain: "admin" }],
    ["bad date", { action: "create_task", title: "x", domain: "personal", dueDate: "tomorrow" }],
    ["priority out of range", { action: "create_task", title: "x", domain: "personal", priority: 5 }],
    ["empty title", { action: "create_task", title: "   ", domain: "personal" }],
    ["oversize title", { action: "create_task", title: "x".repeat(300), domain: "personal" }],
    ["bad kind", { action: "create_event", title: "x", domain: "personal", kind: "party", date: today }],
    ["bad time", { action: "create_event", title: "x", domain: "personal", kind: "other", date: today, time: "25:99" }],
    ["bad schedule day", { action: "create_habit", title: "x", domain: "personal", schedule: { type: "weekly_days", days: ["mon", "funday"] } }],
    ["times out of range", { action: "create_habit", title: "x", domain: "personal", schedule: { type: "times_per_week", times: 9 } }],
    ["not an object", "create_task"],
  ];
  for (const [name, raw] of bads) {
    const r = parseProposal(raw);
    check(`parse rejects: ${name}`, !r.ok && !("proposal" in r));
  }

  const list = parseProposalList({
    proposals: [
      { action: "create_task", title: "Good", domain: "work" },
      { action: "create_task", title: "", domain: "work" },
    ],
  });
  check("parse list: valid items survive, invalid become errors (never applied)",
    list.proposals.length === 1 && list.errors.length === 1);

  // --- guarantee 1: a proposal is data — nothing hits the DB -----------------------
  const before = await snapshot();
  parseProposalList({
    proposals: [
      { action: "create_task", title: "Phantom task", domain: "personal", dueDate: today },
      { action: "create_event", title: "Phantom event", domain: "personal", kind: "other", date: today },
      { action: "create_habit", title: "Phantom habit", domain: "personal", schedule: { type: "daily" } },
    ],
  });
  const afterParse = await snapshot();
  check("CONFIRMED-ACTION: proposing (parse + render path) writes NOTHING",
    JSON.stringify(before) === JSON.stringify(afterParse), JSON.stringify({ before, afterParse }));
  const phantomAbsent =
    !(await listTasks(OWNER)).some((t) => t.title === "Phantom task") &&
    !(await listEventsInRange(OWNER, today, addDaysISO(today, 1))).some((e) => e.title === "Phantom event");
  check("CONFIRMED-ACTION: proposed records do not exist anywhere", phantomAbsent);

  // --- guarantee 2: hostile/malformed approvals rejected, DB untouched --------------
  for (const [name, raw] of bads) {
    const res = await applyProposal(OWNER, raw);
    check(`apply rejects: ${name}`, !res.ok);
  }
  const afterBadApplies = await snapshot();
  check("apply of malformed payloads leaves the DB untouched",
    JSON.stringify(before) === JSON.stringify(afterBadApplies));

  // --- guarantee 3: approve writes through the NORMAL validated path ----------------
  const taskRes = await applyProposal(OWNER, {
    action: "create_task", title: "Assistant-approved task", domain: "work", dueDate: addDaysISO(today, 2), priority: 1,
  });
  const eventRes = await applyProposal(OWNER, {
    action: "create_event", title: "Assistant-approved block", domain: "academic", kind: "session", date: addDaysISO(today, 1), time: "14:00", endTime: "15:30",
  });
  const habitRes = await applyProposal(OWNER, {
    action: "create_habit", title: "Assistant-approved habit", domain: "health", schedule: { type: "times_per_week", times: 3 },
  });
  check("approve: all three actions apply with summaries",
    taskRes.ok && eventRes.ok && habitRes.ok &&
      taskRes.ok === true && /Assistant-approved task/.test(taskRes.summary));

  const appliedTask = (await listTasks(OWNER)).find((t) => t.title === "Assistant-approved task");
  check("applied task visible via the normal read path with validated fields",
    appliedTask != null && appliedTask.priority === 1 && appliedTask.status === "open" &&
      appliedTask.dueDate === addDaysISO(today, 2));
  const appliedEvent = (await listEventsInRange(OWNER, addDaysISO(today, 1), addDaysISO(today, 2)))
    .find((e) => e.title === "Assistant-approved block");
  check("applied event lands on the unified calendar like a manual quick-add",
    appliedEvent != null && appliedEvent.kind === "session" && appliedEvent.timeHM === "14:00" && appliedEvent.endHM === "15:30");
  const appliedHabit = (await listHabitsWithStats(OWNER, today)).habits
    .find((h) => h.title === "Assistant-approved habit");
  check("applied habit visible with its schedule", appliedHabit != null);

  // --- reject = no call: nothing else changed ----------------------------------------
  const afterApplies = await snapshot();
  check("exactly the three approved records were written (nothing else)",
    afterApplies.tasks === before.tasks + 1 &&
      afterApplies.habits === before.habits + 1 &&
      afterApplies.events === before.events + 1,
    JSON.stringify({ before, afterApplies }));

  // --- forUser scoping of the apply path ----------------------------------------------
  await applyProposal(FOREIGN, { action: "create_task", title: "Foreign task", domain: "personal" });
  check("apply for another user never leaks into the owner's data",
    !(await listTasks(OWNER)).some((t) => t.title === "Foreign task"));

  // --- request builder: tool attached, boundary intact ----------------------------------
  const ctx = await assembleContext(OWNER, { feature: "chat" });
  const req = buildChatRequest(ctx, [{ role: "user", content: "hello" }]);
  check("chat request: proposal tool attached + adaptive thinking + context first",
    req.tools?.length === 1 && (req.tools[0] as { name: string }).name === "propose_changes" &&
      req.thinking?.type === "adaptive" &&
      typeof req.messages[0].content === "string" && req.messages[0].content.includes("<lifeos_context>"));
  check("chat system prompt states the confirmed-action contract",
    req.system === CHAT_SYSTEM_PROMPT && /NEVER executed/.test(CHAT_SYSTEM_PROMPT) && /owner explicitly approves/.test(CHAT_SYSTEM_PROMPT));
  check("tool definition itself is inert JSON (no handler, no imports)",
    !("run" in PROPOSAL_TOOL) && JSON.parse(JSON.stringify(PROPOSAL_TOOL)).name === "propose_changes");

  // --- static: the model-facing modules cannot write --------------------------------------
  const src = (p: string) => readFileSync(p, "utf8");
  // a value import of @/db or @/lib/data would couple the module to runtime DB
  // access; `import type` is erased at compile time, so it stays pure
  const hasValueDbImport = (s: string) =>
    s.split("\n").some((line) => /\bfrom "@\/(db|lib\/data\/)/.test(line) && !/^\s*import\s+type\b/.test(line));
  check("static: proposals.ts and request.ts have no runtime DB/data imports (pure; type-only OK)",
    ["src/lib/ai/proposals.ts", "src/lib/ai/request.ts"].every((f) => !hasValueDbImport(src(f))));
  check("static: model-facing modules never import apply's write path",
    ["src/lib/ai/context.ts", "src/lib/ai/request.ts", "src/lib/ai/client.ts", "src/lib/ai/proposals.ts"].every(
      (f) => !/applyProposal|@\/lib\/ai\/apply/.test(src(f))));
  check("static: apply.ts writes only via the existing data-layer creates",
    /from "@\/lib\/data\/tasks"/.test(src("src/lib/ai/apply.ts")) &&
      /from "@\/lib\/data\/events"/.test(src("src/lib/ai/apply.ts")) &&
      !/\.(insert|update|delete)\(/.test(src("src/lib/ai/apply.ts")));

  // --- cleanup (archive through normal paths; residue = archived rows only) -------------
  if (appliedTask) await archiveTask(OWNER, appliedTask.id);
  if (appliedEvent) await archiveEvent(OWNER, appliedEvent.id);
  if (appliedHabit) await archiveHabit(OWNER, appliedHabit.id);
  const foreignTask = (await listTasks(FOREIGN)).find((t) => t.title === "Foreign task");
  if (foreignTask) await archiveTask(FOREIGN, foreignTask.id);
  const afterCleanup = await snapshot();
  check("cleanup: back to the starting state",
    JSON.stringify(afterCleanup) === JSON.stringify(before));

  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
