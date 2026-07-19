"use server";

import { revalidatePath } from "next/cache";
import { applyProposal, type ApplyResult } from "@/lib/ai/apply";
import { aiConfigured, sendToClaude } from "@/lib/ai/client";
import { assembleContext } from "@/lib/ai/context";
import {
  describeProposal,
  parseProposalList,
  type Proposal,
} from "@/lib/ai/proposals";
import { buildChatRequest, type AiMessage } from "@/lib/ai/request";
import { requireUser } from "@/lib/auth";

const MAX_TURNS = 40;
const MAX_USER_TEXT = 4000;

export type ChatProposal = {
  /** toolUseId:index — stable key for decisions + the follow-up tool_result */
  key: string;
  proposal: Proposal;
  description: string;
};

export type ChatResult =
  | {
      ok: true;
      text: string;
      proposals: ChatProposal[];
      /** invalid proposal shapes the model produced — surfaced, never applied */
      invalid: string[];
      /** full assistant content blocks, replayed verbatim on the next turn */
      assistantContent: unknown[];
    }
  | { ok: false; error: string };

/** Minimal shape check on the replayed conversation — the strings the model
 * sees; real trust decisions (writes) never touch this path. */
function sanitizeTurns(raw: unknown): AiMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_TURNS) return null;
  const turns: AiMessage[] = [];
  for (const t of raw) {
    if (typeof t !== "object" || t === null) return null;
    const { role, content } = t as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content === "string") {
      if (content.length === 0 || content.length > MAX_USER_TEXT) return null;
      turns.push({ role, content });
    } else if (Array.isArray(content) && content.length > 0) {
      turns.push({ role, content });
    } else {
      return null;
    }
  }
  return turns;
}

/**
 * One chat round (FR-AI.1/2): assemble context → build the request → send →
 * split the reply into text + typed proposals. Proposals are DATA — nothing
 * here or downstream of here writes; only applyProposalAction does, on the
 * owner's explicit Approve.
 */
export async function chatAction(rawTurns: unknown): Promise<ChatResult> {
  const user = await requireUser();
  if (!aiConfigured()) {
    return { ok: false, error: "ANTHROPIC_API_KEY is not configured on the server." };
  }
  const turns = sanitizeTurns(rawTurns);
  if (!turns) return { ok: false, error: "Invalid conversation payload." };

  try {
    const context = await assembleContext(user.id, { feature: "chat" });
    const response = await sendToClaude(buildChatRequest(context, turns));

    const text = response.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n\n");

    const proposals: ChatProposal[] = [];
    const invalid: string[] = [];
    for (const block of response.content) {
      if (block.type === "tool_use" && block.name === "propose_changes") {
        const parsed = parseProposalList(block.input);
        parsed.proposals.forEach((proposal, i) =>
          proposals.push({
            key: `${block.id}:${i}`,
            proposal,
            description: describeProposal(proposal),
          }),
        );
        invalid.push(...parsed.errors);
      }
    }

    if (response.stop_reason === "refusal") {
      return {
        ok: true,
        text: text || "The model declined to answer this request.",
        proposals: [],
        invalid: [],
        assistantContent: JSON.parse(JSON.stringify(response.content)),
      };
    }

    return {
      ok: true,
      text,
      proposals,
      invalid,
      // strip SDK prototypes; these blocks are replayed verbatim next turn
      assistantContent: JSON.parse(JSON.stringify(response.content)),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: `Assistant request failed: ${message}` };
  }
}

/**
 * The ONLY write path in the assistant (CONFIRMED-ACTION): runs when the
 * owner taps Approve on one review card. Re-validates the payload from
 * scratch and writes through the same forUser create functions as a manual
 * edit. Reject never calls this.
 */
export async function applyProposalAction(raw: unknown): Promise<ApplyResult> {
  const user = await requireUser();
  const result = await applyProposal(user.id, raw);
  if (result.ok) {
    revalidatePath("/");
    revalidatePath("/tasks");
    revalidatePath("/calendar");
    revalidatePath("/habits");
  }
  return result;
}
