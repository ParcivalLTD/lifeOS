/**
 * Rebuilds the API conversation from STORED messages (pure — no DB, no I/O).
 *
 * The confirmed-action contract survives a reload: every past proposal is
 * replayed with a tool_result stating what the owner actually decided, so a
 * resumed chat never lets the model believe it made a change it didn't.
 *
 * Storage is provider-neutral: an assistant turn persists its tool calls as
 * canonical `AiToolCall` records. Conversations written before multi-provider
 * support stored raw Anthropic content blocks instead, so `callsFromStored`
 * reads BOTH shapes — existing chats keep resuming, with their original
 * proposal keys intact (those keys are persisted alongside the owner's
 * decisions, so they can never be renumbered).
 */
import { describeProposal, parseProposalList } from "@/lib/ai/proposals";
import type { AiToolCall, AiTurn } from "@/lib/ai/providers/types";
import type { StoredMessage } from "@/lib/data/conversations";

/** Legacy shape: a raw Anthropic `tool_use` content block. */
type LegacyToolUseBlock = { type: "tool_use"; id: string; name: string; input: unknown };

const isLegacyToolUse = (b: unknown): b is LegacyToolUseBlock =>
  typeof b === "object" &&
  b !== null &&
  (b as { type?: unknown }).type === "tool_use" &&
  typeof (b as { id?: unknown }).id === "string";

/** Canonical shape: `{id, name, input}` with no `type` discriminator. */
const isCanonicalCall = (b: unknown): b is AiToolCall =>
  typeof b === "object" &&
  b !== null &&
  typeof (b as { id?: unknown }).id === "string" &&
  typeof (b as { name?: unknown }).name === "string" &&
  (b as { type?: unknown }).type === undefined;

/**
 * Tool calls carried by a stored assistant turn, in either storage shape.
 * Returns canonical calls regardless of which provider or era wrote the row.
 */
export function callsFromStored(blocks: unknown[] | null): AiToolCall[] {
  const out: AiToolCall[] = [];
  for (const b of blocks ?? []) {
    if (isCanonicalCall(b)) {
      out.push({ id: b.id, name: b.name, input: b.input });
    } else if (isLegacyToolUse(b)) {
      out.push({ id: b.id, name: b.name, input: b.input });
    }
  }
  return out;
}

/** Human-readable outcome per proposal, fed back as the tool result. */
export function decisionSummary(
  call: AiToolCall,
  decisions: Record<string, string>,
): string {
  const { proposals } = parseProposalList(call.input);
  if (proposals.length === 0) return "No valid proposals were shown to the owner.";
  const lines = proposals.map((p, i) => {
    const state = decisions[`${call.id}:${i}`];
    const label =
      state === "approved"
        ? "APPROVED and applied"
        : state === "rejected"
          ? "REJECTED by the owner"
          : "still PENDING (owner has not decided)";
    return `#${i + 1} ${describeProposal(p)}: ${label}`;
  });
  return `Owner decisions on your proposals:\n${lines.join("\n")}`;
}

export function buildReplayTurns(messages: StoredMessage[]): AiTurn[] {
  const turns: AiTurn[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      if (m.text) turns.push({ role: "user", text: m.text });
      continue;
    }
    const calls = callsFromStored(m.blocks);
    if (!m.text && calls.length === 0) continue;

    turns.push({ role: "assistant", text: m.text, calls });

    if (calls.length > 0) {
      turns.push({
        role: "tool_result",
        results: calls.map((c) => ({
          callId: c.id,
          name: c.name,
          content: decisionSummary(c, m.decisions),
        })),
      });
    }
  }
  return turns;
}

/** Proposals carried by an assistant turn's stored calls, with stable keys.
 * The key format `"<callId>:<index>"` is unchanged and provider-independent —
 * adapters guarantee every call has an id, synthesising one where the provider
 * doesn't supply it. */
export function proposalsFromBlocks(blocks: unknown[] | null) {
  const out: {
    key: string;
    description: string;
    proposal: ReturnType<typeof parseProposalList>["proposals"][number];
  }[] = [];
  const invalid: string[] = [];
  for (const call of callsFromStored(blocks)) {
    if (call.name !== "propose_changes") continue;
    const parsed = parseProposalList(call.input);
    parsed.proposals.forEach((proposal, i) =>
      out.push({ key: `${call.id}:${i}`, description: describeProposal(proposal), proposal }),
    );
    invalid.push(...parsed.errors);
  }
  return { proposals: out, invalid };
}
