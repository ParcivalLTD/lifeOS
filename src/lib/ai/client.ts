/**
 * The SOLE path to the LLM API. Nothing else in the codebase may import
 * `@anthropic-ai/sdk` (enforced by the no-restricted-imports lint rule) and
 * nothing else may talk to the API. Every request body comes from the pure
 * builders in `request.ts` over an `assembleContext` payload — so the
 * "what gets sent" preview shows exactly what this module would transmit.
 *
 * Server-side only: the `server-only` import makes bundling this into any
 * client component a build error, and the API key is read from the
 * environment inside the send call (never at module scope, never with a
 * NEXT_PUBLIC_ prefix — same handling as the Supabase service-role key).
 *
 * This module has no write capability: it transmits and returns. Writes
 * happen only in apply.ts, behind the owner's explicit Approve.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AiRequestBody } from "@/lib/ai/request";

/** Whether the server-side key is configured (UI gates on this without ever
 * touching the env var itself — client.ts stays the sole reader). */
export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type StreamChunk =
  | { type: "text"; text: string }
  | { type: "done"; blocks: unknown[]; stopReason: string | null };

/**
 * Streaming counterpart to sendToClaude. Yields plain text deltas as they
 * arrive, then one final chunk with the complete content blocks (which carry
 * any propose_changes tool calls). SDK types stay sealed inside this module —
 * callers only see the plain protocol above, so the boundary holds.
 */
export async function* streamFromClaude(body: AiRequestBody): AsyncGenerator<StreamChunk> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — the AI layer is disabled until the server-side key is configured",
    );
  }
  const client = new Anthropic({ apiKey });
  const stream = client.messages.stream({
    model: body.model,
    max_tokens: body.max_tokens,
    system: body.system,
    ...(body.thinking ? { thinking: body.thinking } : {}),
    ...(body.tools ? { tools: body.tools as Anthropic.ToolUnion[] } : {}),
    messages: body.messages as Anthropic.MessageParam[],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield { type: "text", text: event.delta.text };
    }
  }

  const final = await stream.finalMessage();
  yield {
    type: "done",
    // strip SDK prototypes — these blocks are persisted and replayed verbatim
    blocks: JSON.parse(JSON.stringify(final.content)) as unknown[],
    stopReason: final.stop_reason ?? null,
  };
}

export async function sendToClaude(body: AiRequestBody): Promise<Anthropic.Message> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — the AI layer is disabled until the server-side key is configured",
    );
  }
  const client = new Anthropic({ apiKey });
  return client.messages.create({
    model: body.model,
    max_tokens: body.max_tokens,
    system: body.system,
    ...(body.thinking ? { thinking: body.thinking } : {}),
    ...(body.tools ? { tools: body.tools as Anthropic.ToolUnion[] } : {}),
    messages: body.messages as Anthropic.MessageParam[],
  });
}
