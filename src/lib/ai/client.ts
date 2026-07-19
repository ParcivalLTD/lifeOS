/**
 * The SOLE path to the LLM API. Nothing else in the codebase may import
 * `@anthropic-ai/sdk` (enforced by the no-restricted-imports lint rule) and
 * nothing else may talk to the API. Every request body comes from
 * `buildAiRequest` over an `assembleContext` payload — so the "what gets
 * sent" preview shows exactly what this module would transmit.
 *
 * Server-side only: the `server-only` import makes bundling this into any
 * client component a build error, and the API key is read from the
 * environment inside the send call (never at module scope, never with a
 * NEXT_PUBLIC_ prefix — same handling as the Supabase service-role key).
 *
 * No Phase-4 feature UI exists yet; this transport ships so the boundary is
 * complete, audited, and the only door.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AiRequestBody } from "@/lib/ai/request";

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
    messages: body.messages,
  });
}
