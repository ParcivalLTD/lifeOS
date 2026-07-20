/**
 * Rebuilds the API conversation from STORED messages (pure — no DB, no I/O).
 *
 * The confirmed-action contract survives a reload: every past proposal is
 * replayed with a tool_result stating what the owner actually decided, so a
 * resumed chat never lets the model believe it made a change it didn't.
 */
import { describeProposal, parseProposalList } from "@/lib/ai/proposals";
import type { AiMessage } from "@/lib/ai/request";
import type { StoredMessage } from "@/lib/data/conversations";

type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: unknown };

const isToolUse = (b: unknown): b is ToolUseBlock =>
  typeof b === "object" &&
  b !== null &&
  (b as { type?: unknown }).type === "tool_use" &&
  typeof (b as { id?: unknown }).id === "string";

/** Human-readable outcome per proposal, fed back as the tool_result. */
export function decisionSummary(
  block: ToolUseBlock,
  decisions: Record<string, string>,
): string {
  const { proposals } = parseProposalList(block.input);
  if (proposals.length === 0) return "No valid proposals were shown to the owner.";
  const lines = proposals.map((p, i) => {
    const state = decisions[`${block.id}:${i}`];
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

export function buildReplayTurns(messages: StoredMessage[]): AiMessage[] {
  const turns: AiMessage[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      if (m.text) turns.push({ role: "user", content: m.text });
      continue;
    }
    const blocks = m.blocks ?? [];
    if (blocks.length === 0) {
      if (m.text) turns.push({ role: "assistant", content: m.text });
      continue;
    }
    turns.push({ role: "assistant", content: blocks });
    const toolUses = blocks.filter(isToolUse);
    if (toolUses.length > 0) {
      turns.push({
        role: "user",
        content: toolUses.map((t) => ({
          type: "tool_result",
          tool_use_id: t.id,
          content: decisionSummary(t, m.decisions),
        })),
      });
    }
  }
  return turns;
}

/** Proposals carried by an assistant turn's stored blocks, with stable keys. */
export function proposalsFromBlocks(blocks: unknown[] | null) {
  const out: { key: string; description: string; proposal: ReturnType<typeof parseProposalList>["proposals"][number] }[] = [];
  const invalid: string[] = [];
  for (const b of blocks ?? []) {
    if (!isToolUse(b) || b.name !== "propose_changes") continue;
    const parsed = parseProposalList(b.input);
    parsed.proposals.forEach((proposal, i) =>
      out.push({ key: `${b.id}:${i}`, description: describeProposal(proposal), proposal }),
    );
    invalid.push(...parsed.errors);
  }
  return { proposals: out, invalid };
}
