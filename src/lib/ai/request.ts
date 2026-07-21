/**
 * Pure request builder for the LLM boundary: assembled context → the exact
 * PROVIDER-NEUTRAL request. Pure and SDK-free so the preview page and the
 * verify suite can inspect precisely what would be sent — the audit surface
 * for the boundary (nothing here performs I/O).
 *
 * This is the same request whichever provider serves it; only the adapter in
 * `providers/` renders it into a vendor wire format, and only `client.ts`
 * puts it on the wire.
 */
import type { AiFeature, AssembledContext } from "@/lib/ai/context";
import type { AiSendRequest, AiToolSpec, AiTurn } from "@/lib/ai/providers/types";

/**
 * Static system prompt — deliberately frozen (no interpolation) so the
 * cacheable prefix never varies and the payload stays auditable.
 */
export const SYSTEM_PROMPT = [
  "You are the assistant layer of Helm, a private single-user life dashboard.",
  "The user message contains structured summaries of the owner's own data",
  "(goals, schedule, budgets, training, academics, work) inside",
  "<helm_context> tags, followed by the task. The data belongs to the",
  "person you are talking to — answer from it plainly and specifically,",
  "and say so when it cannot answer the question. Never invent figures:",
  "every number you state must come from the context.",
].join(" ");

/**
 * Chat system prompt = the base prompt + the CONFIRMED-ACTION contract.
 * The contract is structural (the tool is not wired to anything), but the
 * model needs to know the semantics so it reasons about them correctly.
 */
export const CHAT_SYSTEM_PROMPT = [
  SYSTEM_PROMPT,
  "You can propose changes with the propose_changes tool: creating tasks,",
  "calendar events, or habits. Proposals are NEVER executed by you — they are",
  "shown to the owner as review cards, and each one is applied only if the",
  "owner explicitly approves it. Never claim a change was made; a later",
  "tool_result will tell you which proposals the owner approved or rejected.",
  "Use the tool when a plan or suggestion should become concrete items (e.g.",
  "a study plan as calendar events); keep answering in text otherwise.",
  "Keep answers concise and grounded in the context figures. The chat UI",
  "renders your text as plain text, not markdown — never use **bold**,",
  "headings, or markdown tables; use plain sentences and simple dashed lists",
  "instead.",
].join(" ");

/**
 * The proposal tool — plain JSON, wired to NOTHING. Its input is parsed by
 * `proposals.ts` and rendered for review; only `apply.ts` (behind the
 * owner's Approve, after full re-validation) ever writes.
 *
 * Declared in the canonical `AiToolSpec` shape: each adapter renames
 * `parameters` to whatever its provider expects (`input_schema` for
 * Anthropic, `parameters` for OpenAI, `parametersJsonSchema` for Gemini).
 * The schema itself is identical for all three, which is what makes a
 * proposal from any provider parse through the same validator.
 */
export const PROPOSAL_TOOL: AiToolSpec = {
  name: "propose_changes",
  description:
    "Propose creating tasks, calendar events, or habits in Helm. Proposals are shown to the owner for review — nothing is created unless the owner approves each item. Dates are YYYY-MM-DD, times are 24h HH:MM. Domains: personal | academic | work | finance | gym | health. Event kinds: appointment | deadline | session | bill | birthday | other.",
  parameters: {
    type: "object",
    properties: {
      proposals: {
        type: "array",
        maxItems: 10,
        items: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["create_task", "create_event", "create_habit"],
            },
            title: { type: "string" },
            domain: {
              type: "string",
              enum: ["personal", "academic", "work", "finance", "gym", "health"],
            },
            dueDate: { type: ["string", "null"], description: "create_task: YYYY-MM-DD" },
            priority: { type: "integer", enum: [1, 2, 3], description: "create_task: 1 = highest" },
            kind: {
              type: "string",
              enum: ["appointment", "deadline", "session", "bill", "birthday", "other"],
              description: "create_event only",
            },
            date: { type: "string", description: "create_event: YYYY-MM-DD" },
            time: { type: ["string", "null"], description: "create_event: HH:MM, null = all-day" },
            endTime: { type: ["string", "null"], description: "create_event: HH:MM" },
            schedule: {
              type: "object",
              description:
                'create_habit: {"type":"daily"} | {"type":"weekly_days","days":["mon","wed"]} | {"type":"times_per_week","times":3}',
            },
          },
          required: ["action", "title", "domain"],
        },
      },
    },
    required: ["proposals"],
  },
};

const FEATURE_TASK: Record<AiFeature, string> = {
  chat: "Answer the owner's question using the context above.",
  "weekly-review-draft":
    "Draft a concise weekly review summary from the context above: what moved, what slipped, and suggested top 3 for next week. State the basis for every figure.",
  "daily-nudge":
    "Write ONE short, data-grounded observation or suggestion for today from the context above. No preamble, max 2 sentences, must cite the specific data points it rests on.",
};

const contextBlock = (context: AssembledContext): string =>
  `<helm_context>\n${JSON.stringify(context, null, 2)}\n</helm_context>`;

/**
 * Builds the exact request body for a feature. `userTask` is the free-text
 * ask (chat); omitted for generated features which use their fixed task.
 */
export function buildAiRequest(
  context: AssembledContext,
  feature: AiFeature,
  userTask?: string,
): AiSendRequest {
  const task = userTask?.trim() || FEATURE_TASK[feature];
  return {
    maxTokens: 2048,
    system: SYSTEM_PROMPT,
    turns: [{ role: "user", text: `${contextBlock(context)}\n\n${task}` }],
  };
}

/**
 * Builds the exact chat request: frozen system prompt, fresh context as the
 * opening user turn (the API merges consecutive user turns), then the
 * conversation. The proposal tool is attached; adaptive thinking on.
 */
export function buildChatRequest(
  context: AssembledContext,
  turns: AiTurn[],
): AiSendRequest {
  return {
    maxTokens: 4096,
    system: CHAT_SYSTEM_PROMPT,
    reasoning: "deep",
    tools: [PROPOSAL_TOOL],
    turns: [{ role: "user", text: contextBlock(context) }, ...turns],
  };
}
