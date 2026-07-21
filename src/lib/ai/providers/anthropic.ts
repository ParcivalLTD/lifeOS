import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type {
  AiStreamChunk,
  AiToolCall,
  AiTurn,
  ProviderAdapter,
} from "./types";

/**
 * Anthropic adapter. One of exactly three files permitted to import a vendor
 * SDK (enforced by the no-restricted-imports lint rule + verify-providers).
 *
 * Model ids per Anthropic's current catalogue: Haiku 4.5 / Sonnet 5 /
 * Opus 4.8. Adaptive thinking must be set EXPLICITLY on Opus 4.8 — omitting
 * the field runs without thinking — and `budget_tokens`, `temperature`,
 * `top_p`, `top_k` are rejected with a 400 on this generation, so none of them
 * appear here.
 */

const KEY = "ANTHROPIC_API_KEY";

/** Anthropic content blocks we care about; the rest are ignored on decode. */
type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: unknown };

const isToolUse = (b: unknown): b is ToolUseBlock =>
  typeof b === "object" &&
  b !== null &&
  (b as { type?: unknown }).type === "tool_use" &&
  typeof (b as { id?: unknown }).id === "string";

/** Canonical turns → Anthropic messages. */
function toMessages(turns: AiTurn[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const turn of turns) {
    if (turn.role === "user") {
      out.push({ role: "user", content: turn.text });
      continue;
    }
    if (turn.role === "assistant") {
      const blocks: unknown[] = [];
      if (turn.text) blocks.push({ type: "text", text: turn.text });
      for (const c of turn.calls) {
        blocks.push({ type: "tool_use", id: c.id, name: c.name, input: c.input });
      }
      // an assistant turn with neither text nor calls is not a valid message
      if (blocks.length > 0) {
        out.push({ role: "assistant", content: blocks as Anthropic.ContentBlockParam[] });
      }
      continue;
    }
    // tool results ride on a USER turn in the Messages API
    out.push({
      role: "user",
      content: turn.results.map((r) => ({
        type: "tool_result" as const,
        tool_use_id: r.callId,
        content: r.content,
      })) as Anthropic.ContentBlockParam[],
    });
  }
  return out;
}

export const anthropicAdapter: ProviderAdapter = {
  id: "anthropic",
  label: "Claude",

  configured: () => Boolean(process.env[KEY]),

  models: {
    fast: { id: "claude-haiku-4-5", label: "Haiku 4.5" },
    balanced: { id: "claude-sonnet-5", label: "Sonnet 5" },
    deep: { id: "claude-opus-4-8", label: "Opus 4.8" },
  },

  async *stream(model, req): AsyncGenerator<AiStreamChunk> {
    const apiKey = process.env[KEY];
    if (!apiKey) {
      throw new Error(`${KEY} is not set — the Claude provider is unavailable`);
    }
    const client = new Anthropic({ apiKey });

    const stream = client.messages.stream({
      model,
      max_tokens: req.maxTokens,
      system: req.system,
      // adaptive is the only on-mode on this generation; explicit or it's off
      thinking: { type: "adaptive" },
      ...(req.tools
        ? {
            tools: req.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.parameters,
            })) as Anthropic.ToolUnion[],
          }
        : {}),
      messages: toMessages(req.turns),
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "text", text: event.delta.text };
      }
    }

    const final = await stream.finalMessage();
    // strip SDK prototypes before anything downstream touches these
    const blocks = JSON.parse(JSON.stringify(final.content)) as unknown[];

    const text = blocks
      .filter(
        (b): b is { type: "text"; text: string } =>
          typeof b === "object" &&
          b !== null &&
          (b as { type?: unknown }).type === "text",
      )
      .map((b) => b.text)
      .join("");

    const calls: AiToolCall[] = blocks
      .filter(isToolUse)
      .map((b) => ({ id: b.id, name: b.name, input: b.input }));

    yield { type: "done", text, calls, stopReason: final.stop_reason ?? null };
  },
};
