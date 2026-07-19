/**
 * Pure request builder for the LLM boundary: assembled context → the EXACT
 * Messages API request body. Pure and SDK-free so the preview page and the
 * verify suite can inspect precisely what would be sent, byte for byte —
 * the audit surface for the boundary (nothing here performs I/O).
 *
 * Only `src/lib/ai/client.ts` may put this request on the wire.
 */
import type { AiFeature, AssembledContext } from "@/lib/ai/context";

/** Current Claude model (per Anthropic's docs at time of writing). */
export const AI_MODEL = "claude-opus-4-8";

export type AiRequestBody = {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: "user"; content: string }[];
};

/**
 * Static system prompt — deliberately frozen (no interpolation) so the
 * cacheable prefix never varies and the payload stays auditable.
 */
export const SYSTEM_PROMPT = [
  "You are the assistant layer of LifeOS, a private single-user life dashboard.",
  "The user message contains structured summaries of the owner's own data",
  "(goals, schedule, budgets, training, academics, work) inside",
  "<lifeos_context> tags, followed by the task. The data belongs to the",
  "person you are talking to — answer from it plainly and specifically,",
  "and say so when it cannot answer the question. Never invent figures:",
  "every number you state must come from the context.",
].join(" ");

const FEATURE_TASK: Record<AiFeature, string> = {
  chat: "Answer the owner's question using the context above.",
  "weekly-review-draft":
    "Draft a concise weekly review summary from the context above: what moved, what slipped, and suggested top 3 for next week. State the basis for every figure.",
  "daily-nudge":
    "Write ONE short, data-grounded observation or suggestion for today from the context above. No preamble, max 2 sentences, must cite the specific data points it rests on.",
};

/**
 * Builds the exact request body for a feature. `userTask` is the free-text
 * ask (chat); omitted for generated features which use their fixed task.
 */
export function buildAiRequest(
  context: AssembledContext,
  feature: AiFeature,
  userTask?: string,
): AiRequestBody {
  const task = userTask?.trim() || FEATURE_TASK[feature];
  return {
    model: AI_MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `<lifeos_context>\n${JSON.stringify(context, null, 2)}\n</lifeos_context>\n\n${task}`,
      },
    ],
  };
}
