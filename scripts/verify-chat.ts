/**
 * Assistant conversation persistence verification (chat redesign step).
 * Proves, against the real DB (no API calls needed for most checks):
 *
 *   1. Conversations + messages persist via forUser, survive a fresh read
 *      (simulating reload), and resume with the confirmed-action decisions
 *      intact.
 *   2. Auto-title derives from the first user message; archive-then-delete
 *      semantics hold (archived rows leave listConversations but the
 *      transcript and its messages remain in the database).
 *   3. Conversations + conversation_messages are included in the NFR-4
 *      export.
 *   4. The outbound boundary is UNCHANGED: buildReplayTurns/buildChatRequest
 *      never carries raw journal text, and the sole-SDK-importer rule still
 *      holds with the new streaming path added.
 *
 * Usage: npm run test:chat
 */
import { readdirSync, readFileSync } from "node:fs";
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
  const { conversationMessages, conversations } = await import("@/db/schema");
  const {
    appendMessage, archiveConversation, createConversation, getConversation,
    listConversations, purgeConversation, recordDecision, renameConversation,
    titleFromText,
  } = await import("@/lib/data/conversations");
  const { buildReplayTurns, decisionSummary, proposalsFromBlocks } = await import("@/lib/ai/replay");
  const { assembleContext } = await import("@/lib/ai/context");
  const { buildChatRequest } = await import("@/lib/ai/request");
  const { buildExport } = await import("@/lib/backup");
  const { eq } = await import("drizzle-orm");

  const OWNER = process.env.SEED_USER_ID!;
  const FOREIGN = "00000000-0000-0000-0000-00000000dead";

  // --- pure: titleFromText -------------------------------------------------------
  check("titleFromText: trims + collapses whitespace", titleFromText("  hi   there  ") === "hi there");
  check("titleFromText: empty → default", titleFromText("   ") === "New chat");
  check("titleFromText: truncates long titles with an ellipsis",
    titleFromText("x".repeat(90)).length === 60 && titleFromText("x".repeat(90)).endsWith("…"));

  // --- 1: create, append, persist, "reload" (fresh read) --------------------------
  const id = await createConversation(OWNER);
  const empty = await listConversations(OWNER);
  check("new conversation starts titled 'New chat' and is listed", empty.some((c) => c.id === id && c.title === "New chat"));

  await appendMessage(OWNER, id, { role: "user", text: "Can I afford a laptop in March?" });
  const afterFirst = await getConversation(OWNER, id);
  check("auto-title derives from the first user message", afterFirst?.title === "Can I afford a laptop in March?");
  check("user message persisted with its text", afterFirst?.messages[0]?.text === "Can I afford a laptop in March?");

  const assistantBlocks = [
    { type: "text", text: "Looking at your budget, yes — here's a task." },
    {
      type: "tool_use",
      id: "toolu_01test",
      name: "propose_changes",
      input: { proposals: [{ action: "create_task", title: "Buy laptop", domain: "personal", priority: 2 }] },
    },
  ];
  const assistantMsgId = await appendMessage(OWNER, id, {
    role: "assistant",
    text: "Looking at your budget, yes — here's a task.",
    blocks: assistantBlocks,
  });

  // "reload": a fresh read from the DB, not the in-memory objects above
  const reloaded = await getConversation(OWNER, id);
  check("reload: conversation has both turns in order",
    reloaded?.messages.length === 2 &&
      reloaded.messages[0].role === "user" &&
      reloaded.messages[1].role === "assistant");
  // Postgres JSONB does not preserve key order, so compare structurally
  // (deep-sorted-key JSON), not as a raw string.
  const canon = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canon)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canon(x)]))
        : v;
  check("reload: assistant blocks round-trip structurally (incl. the tool_use proposal)",
    JSON.stringify(canon(reloaded?.messages[1].blocks)) === JSON.stringify(canon(assistantBlocks)),
    JSON.stringify(reloaded?.messages[1].blocks));
  check("reload: title survived (auto-titled once, not re-titled by the assistant turn)",
    reloaded?.title === "Can I afford a laptop in March?");

  const afterAppendList = await listConversations(OWNER);
  const listedEntry = afterAppendList.find((c) => c.id === id);
  check("appending bumps the conversation to the top of history (updatedAt advances)",
    listedEntry != null && afterAppendList[0].id === id);

  // --- decisions: recorded, survive reload, never re-apply anything -----------------
  const proposalKey = "toolu_01test:0";
  await recordDecision(OWNER, assistantMsgId, proposalKey, "approved");
  const withDecision = await getConversation(OWNER, id);
  const decidedMsg = withDecision?.messages.find((m) => m.id === assistantMsgId);
  check("resume: the approval decision persisted on the message",
    decidedMsg?.decisions[proposalKey] === "approved");

  const { proposals } = proposalsFromBlocks(decidedMsg?.blocks ?? null);
  check("resume: the proposal itself is recoverable from stored blocks (for re-rendering the card)",
    proposals.length === 1 && proposals[0].key === proposalKey && proposals[0].proposal.action === "create_task");

  // --- 2: rename + archive-then-delete ---------------------------------------------
  await renameConversation(OWNER, id, "  Laptop budget check  ");
  check("rename: title updated and normalized", (await getConversation(OWNER, id))?.title === "Laptop budget check");

  await archiveConversation(OWNER, id);
  const afterArchiveList = await listConversations(OWNER);
  check("archive: conversation leaves the active list", !afterArchiveList.some((c) => c.id === id));
  check("archive: the row + its transcript are NOT gone (soft delete, like tasks/habits)",
    (await getConversation(OWNER, id)) === null); // getConversation excludes archived by design…
  const rawRow = await forUser(OWNER).select(conversations, { where: eq(conversations.id, id) });
  const rawMsgs = await forUser(OWNER).select(conversationMessages, { where: eq(conversationMessages.conversationId, id) });
  check("archive: …but the raw rows are still in the database", rawRow[0]?.archived === true && rawMsgs.length === 2);

  await purgeConversation(OWNER, id);
  const purgedRow = await forUser(OWNER).select(conversations, { where: eq(conversations.id, id) });
  const purgedMsgs = await forUser(OWNER).select(conversationMessages, { where: eq(conversationMessages.conversationId, id) });
  check("purge: hard delete cascades to messages (only reachable after archive)",
    purgedRow.length === 0 && purgedMsgs.length === 0);

  // purge refuses a live (non-archived) conversation — the two-step is enforced
  const liveId = await createConversation(OWNER, "still live");
  await purgeConversation(OWNER, liveId); // should no-op: not archived
  check("purge: refuses to delete a non-archived conversation", (await getConversation(OWNER, liveId)) != null);
  await archiveConversation(OWNER, liveId);
  await purgeConversation(OWNER, liveId);

  // --- 3: included in the NFR-4 export ----------------------------------------------
  const exportId = await createConversation(OWNER, "Export check conversation");
  await appendMessage(OWNER, exportId, { role: "user", text: "export me" });
  const dump = await buildExport();
  check("export: conversations table present with a positive count",
    "conversations" in dump.counts && dump.counts.conversations > 0);
  check("export: conversation_messages table present with a positive count",
    "conversation_messages" in dump.counts && dump.counts.conversation_messages > 0);
  const exportedConvo = (dump.data.conversations as { id: string; title: string }[]).find((c) => c.id === exportId);
  check("export: the actual conversation row is in the dump",
    exportedConvo != null && exportedConvo.title === "Export check conversation");
  const exportedMsgs = (dump.data.conversation_messages as { conversationId: string }[])
    .filter((m) => m.conversationId === exportId);
  check("export: its messages are in the dump", exportedMsgs.length >= 1, `found ${exportedMsgs.length}`);
  await archiveConversation(OWNER, exportId);
  await purgeConversation(OWNER, exportId);

  // --- 4: outbound boundary is UNCHANGED ---------------------------------------------
  const journalConvoId = await createConversation(OWNER);
  await appendMessage(OWNER, journalConvoId, { role: "user", text: "How was my week?" });
  const convoForReplay = await getConversation(OWNER, journalConvoId);
  const replayTurns = buildReplayTurns(convoForReplay?.messages ?? []);
  const ctx = await assembleContext(OWNER, { feature: "chat" });
  const chatReq = buildChatRequest(ctx, replayTurns);
  const serializedReq = JSON.stringify(chatReq);
  check("boundary: journal body text is still excluded from the chat request by default",
    ctx.meta.journalTextIncluded === false && !serializedReq.includes("Meal-prepped for the week"));
  check("boundary: replayed history carries the real user text, not a summary substitute",
    serializedReq.includes("How was my week?"));
  await archiveConversation(OWNER, journalConvoId);
  await purgeConversation(OWNER, journalConvoId);

  // decisionSummary never fabricates an outcome for a still-pending proposal
  const pendingBlock = { type: "tool_use" as const, id: "toolu_pending", name: "propose_changes", input: {
    proposals: [{ action: "create_task", title: "x", domain: "personal" }],
  }};
  check("boundary: undecided proposals replay as PENDING, never as approved",
    /still PENDING/.test(decisionSummary(pendingBlock, {})));

  // static: streaming stays inside the sole boundary module
  const src = (p: string) => readFileSync(p, "utf8");
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
    );
  const srcFiles = walk("src").filter((f) => /\.(ts|tsx)$/.test(f));
  const sdkImporters = srcFiles.filter((f) => /from "@anthropic-ai\/sdk"/.test(src(f)));
  check("boundary: streaming lives behind the adapters — the ONLY SDK importers",
    sdkImporters.length === 1 && sdkImporters[0].endsWith("src/lib/ai/providers/anthropic.ts"), sdkImporters.join(","));
  check("boundary: the chat route never imports the SDK directly (goes through client.ts)",
    !src("src/app/api/assistant/chat/route.ts").includes("@anthropic-ai/sdk"));
  check("boundary: conversations.ts is DB-only (no SDK, no fetch to the API)",
    !src("src/lib/data/conversations.ts").includes("@anthropic-ai/sdk") &&
      !src("src/lib/data/conversations.ts").includes("fetch("));

  // --- forUser isolation ----------------------------------------------------------
  const foreignId = await createConversation(FOREIGN);
  check("forUser: a conversation created for one user is invisible to another",
    !(await listConversations(OWNER)).some((c) => c.id === foreignId));
  await archiveConversation(FOREIGN, foreignId);
  await purgeConversation(FOREIGN, foreignId);

  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
