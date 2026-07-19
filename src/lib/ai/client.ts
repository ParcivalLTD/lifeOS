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
