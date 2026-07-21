/**
 * The SOLE path to any LLM API.
 *
 * Vendor SDKs live behind the adapters in `providers/` — those three files are
 * the only ones permitted to import `@anthropic-ai/sdk`, `openai`, or
 * `@google/genai` (enforced by the no-restricted-imports lint rule and
 * asserted by `npm run test:providers`). This module picks an adapter and
 * hands it a provider-neutral request; nothing above it knows or cares which
 * provider is active.
 *
 * Every request body still comes from the pure builders in `request.ts` over
 * an `assembleContext` payload, so the "what gets sent" preview shows exactly
 * what this module would transmit — for any provider.
 *
 * Server-side only: `server-only` makes bundling this into a client component
 * a build error, and each adapter reads its own key from the environment
 * inside the send call (never at module scope, never NEXT_PUBLIC_).
 *
 * This module has no write capability: it transmits and returns. Writes happen
 * only in apply.ts, behind the owner's explicit Approve.
 */
import "server-only";

import { getAdapter } from "@/lib/ai/providers";
import type {
  AiSendRequest,
  AiStreamChunk,
  ProviderId,
} from "@/lib/ai/providers/types";

export { anyProviderConfigured, availableProviders, defaultProvider, resolveSelection, DEFAULT_TIER } from "@/lib/ai/providers";
export type { ProviderOption } from "@/lib/ai/providers";

/** Whether ANY provider is configured — the UI gates on this without ever
 * touching an env var itself (the adapters stay the sole readers). */
export function aiConfigured(): boolean {
  // re-exported from the registry; kept as a named function because callers
  // and the verify suite both reference `aiConfigured()` by name
  return getAdapters().some((a) => a.configured());
}

function getAdapters() {
  return (["anthropic", "openai", "google"] as ProviderId[]).map(getAdapter);
}

export type StreamChunk = AiStreamChunk;

/**
 * Streamed turn from a chosen provider. Yields plain text deltas as they
 * arrive, then one final chunk carrying the assembled text and any tool calls
 * — already normalised to the canonical `AiToolCall` shape, so the caller
 * cannot tell which provider produced them.
 */
export function streamFromProvider(
  provider: ProviderId,
  model: string,
  body: AiSendRequest,
): AsyncGenerator<AiStreamChunk> {
  return getAdapter(provider).stream(model, body);
}
