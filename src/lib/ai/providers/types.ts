/**
 * The provider-neutral vocabulary of the AI layer.
 *
 * Everything above the adapters — request building, proposal parsing, replay,
 * persistence, the review cards, the write path — speaks ONLY these types.
 * Nothing here imports a vendor SDK, and nothing here is shaped after one
 * provider's wire format: the canonical shape is deliberately its own thing so
 * no provider is privileged and none of their differences leak upward.
 *
 * The three impedance mismatches this format absorbs:
 *
 *  - Anthropic returns tool arguments as an OBJECT in a `tool_use` content
 *    block; OpenAI returns them as a JSON STRING on `function_call.arguments`;
 *    Gemini returns them as an object on a `functionCall` part.
 *  - Anthropic and OpenAI give every call a stable id (`tool_use.id` /
 *    `call_id`); Gemini's `FunctionCall.id` is optional and generally absent
 *    on the Gemini API, so its adapter SYNTHESISES one per turn.
 *  - Results are returned as a `tool_result` block (Anthropic), a `tool` role
 *    message (OpenAI), or a `functionResponse` part matched by NAME (Gemini).
 *
 * After decoding, all three produce the same `AiToolCall`, which is what makes
 * the confirmed-action flow identical regardless of who generated it.
 */

export type ProviderId = "anthropic" | "openai" | "google";

/** Capability tier, not a vendor model name — each provider maps its own. */
export type Tier = "fast" | "balanced" | "deep";

export const TIERS: Tier[] = ["fast", "balanced", "deep"];

export const isProviderId = (v: unknown): v is ProviderId =>
  v === "anthropic" || v === "openai" || v === "google";

export const isTier = (v: unknown): v is Tier =>
  v === "fast" || v === "balanced" || v === "deep";

// --- conversation shape ------------------------------------------------------

/** One tool invocation the model asked for. `input` is always a decoded
 * object — never a JSON string — so `parseProposalList` sees the same thing
 * whichever provider produced it. */
export type AiToolCall = {
  /** Stable within a conversation. Synthesised by adapters that don't get one
   * from the provider; it is what the proposal key `"<id>:<index>"` is built
   * from, so it must round-trip through persistence unchanged. */
  id: string;
  name: string;
  input: unknown;
};

/** What we send back after the owner decides. Carries `name` as well as
 * `callId` because Gemini matches results to calls by NAME, not by id. */
export type AiToolResult = {
  callId: string;
  name: string;
  content: string;
};

export type AiTurn =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; calls: AiToolCall[] }
  | { role: "tool_result"; results: AiToolResult[] };

/** A tool the model may call. Plain JSON Schema in `parameters` — each adapter
 * renames the field to whatever its provider expects. */
export type AiToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

/**
 * The provider-neutral request. This is what the audit surface
 * (`/settings/ai-preview`) renders and what the verify suite asserts on — the
 * per-provider wire body is derived from it inside the adapter and nowhere
 * else.
 */
export type AiSendRequest = {
  system: string;
  turns: AiTurn[];
  tools?: AiToolSpec[];
  maxTokens: number;
  /** Hint only. Adapters map it to their own reasoning control (Anthropic
   * adaptive thinking, etc.) or ignore it — never a hard requirement. */
  reasoning?: "default" | "deep";
};

export type AiStreamChunk =
  | { type: "text"; text: string }
  | {
      type: "done";
      text: string;
      calls: AiToolCall[];
      stopReason: string | null;
    };

// --- the adapter contract ----------------------------------------------------

export type ModelChoice = {
  /** The provider's own model id, sent on the wire. */
  id: string;
  /** Shown in the picker. */
  label: string;
  /** Surfaced in the UI where it materially affects the owner's decision —
   * e.g. a free tier whose terms allow training on submitted content. */
  note?: string;
};

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly label: string;
  /** True when this provider's API key is present in the server environment.
   * An unconfigured provider is HIDDEN from the picker, never an error. */
  configured(): boolean;
  readonly models: Record<Tier, ModelChoice>;
  /** Streamed turn. Yields text deltas, then exactly one `done`. */
  stream(model: string, req: AiSendRequest): AsyncGenerator<AiStreamChunk>;
}
