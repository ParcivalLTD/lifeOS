import "server-only";

import OpenAI from "openai";
import type {
  AiStreamChunk,
  AiToolCall,
  AiTurn,
  ProviderAdapter,
} from "./types";

/**
 * OpenAI adapter, on the Responses API.
 *
 * The one real impedance mismatch: OpenAI returns tool arguments as a JSON
 * STRING (`function_call.arguments`), where the canonical shape wants a
 * decoded object. That parse happens here — see `decodeArgs`. A model that
 * emits malformed JSON must NOT crash the turn: the call still surfaces, with
 * an input that fails validation in `parseProposalList` and is reported as an
 * invalid proposal exactly like any other bad payload.
 *
 * Pairing uses `call_id` (not `id`) — that is the field `function_call_output`
 * matches on.
 */

const KEY = "OPENAI_API_KEY";

/** JSON string → object. Never throws: a bad payload becomes a value that
 * fails proposal validation downstream, which is the honest outcome. */
function decodeArgs(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { __malformed__: raw };
  }
}

/** Canonical turns → Responses API input items. */
function toInput(turns: AiTurn[]): OpenAI.Responses.ResponseInput {
  const out: OpenAI.Responses.ResponseInput = [];
  for (const turn of turns) {
    if (turn.role === "user") {
      out.push({ role: "user", content: turn.text });
      continue;
    }
    if (turn.role === "assistant") {
      if (turn.text) out.push({ role: "assistant", content: turn.text });
      for (const c of turn.calls) {
        out.push({
          type: "function_call",
          call_id: c.id,
          name: c.name,
          arguments: JSON.stringify(c.input ?? {}),
        });
      }
      continue;
    }
    for (const r of turn.results) {
      out.push({
        type: "function_call_output",
        call_id: r.callId,
        output: r.content,
      });
    }
  }
  return out;
}

export const openaiAdapter: ProviderAdapter = {
  id: "openai",
  label: "ChatGPT",

  configured: () => Boolean(process.env[KEY]),

  models: {
    fast: { id: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
    balanced: { id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
    deep: { id: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
  },

  async *stream(model, req): AsyncGenerator<AiStreamChunk> {
    const apiKey = process.env[KEY];
    if (!apiKey) {
      throw new Error(`${KEY} is not set — the ChatGPT provider is unavailable`);
    }
    const client = new OpenAI({ apiKey });

    const stream = await client.responses.create({
      model,
      instructions: req.system,
      max_output_tokens: req.maxTokens,
      input: toInput(req.turns),
      ...(req.tools
        ? {
            tools: req.tools.map((t) => ({
              type: "function" as const,
              name: t.name,
              description: t.description,
              parameters: t.parameters,
              strict: false,
            })),
          }
        : {}),
      stream: true,
    });

    let text = "";
    const calls: AiToolCall[] = [];

    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        text += event.delta;
        yield { type: "text", text: event.delta };
        continue;
      }
      // completed function calls arrive as finished output items
      if (
        event.type === "response.output_item.done" &&
        event.item.type === "function_call"
      ) {
        calls.push({
          id: event.item.call_id,
          name: event.item.name,
          input: decodeArgs(event.item.arguments),
        });
      }
    }

    yield {
      type: "done",
      text,
      calls,
      stopReason: calls.length > 0 ? "tool_use" : "end_turn",
    };
  },
};
