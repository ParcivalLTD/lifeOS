import "server-only";

import { GoogleGenAI } from "@google/genai";
import type {
  AiStreamChunk,
  AiToolCall,
  AiTurn,
  ProviderAdapter,
} from "./types";

/**
 * Gemini adapter.
 *
 * Two mismatches worth knowing about:
 *
 *  1. NO RELIABLE CALL ID. `FunctionCall.id` is optional and generally absent
 *     on the Gemini API, but the confirmed-action flow keys every proposal on
 *     `"<callId>:<index>"` and that key is PERSISTED with the owner's decision.
 *     So when the provider gives us nothing we synthesise a deterministic id
 *     from the call's position in the turn (`g<turnIndex>_<callIndex>`). It is
 *     stable for the life of the message because it is derived from data we
 *     store verbatim, and it never collides with a real provider id.
 *  2. RESULTS MATCH BY NAME. `functionResponse` is paired to its call by
 *     function name rather than by id, which is why `AiToolResult` carries
 *     `name` alongside `callId`.
 *
 * Tool schemas go in `parametersJsonSchema` (standard JSON Schema), NOT
 * `parameters` (which expects Google's OpenAPI-flavoured Schema type). The two
 * are mutually exclusive.
 */

const KEY = "GOOGLE_AI_API_KEY";

/** Free-tier terms allow submitted content to be used to improve Google's
 * products. Surfaced in the picker so the choice is informed at the point it
 * is made — this app's whole premise is private personal data. */
const FREE_TIER_NOTE = "Free tier — Google may use submitted content for training";

const synthesiseId = (turnIndex: number, callIndex: number) =>
  `g${turnIndex}_${callIndex}`;

/** Canonical turns → Gemini contents. */
function toContents(turns: AiTurn[]) {
  const contents: { role: "user" | "model"; parts: Record<string, unknown>[] }[] = [];
  for (const turn of turns) {
    if (turn.role === "user") {
      contents.push({ role: "user", parts: [{ text: turn.text }] });
      continue;
    }
    if (turn.role === "assistant") {
      const parts: Record<string, unknown>[] = [];
      if (turn.text) parts.push({ text: turn.text });
      for (const c of turn.calls) {
        parts.push({ functionCall: { name: c.name, args: c.input ?? {} } });
      }
      if (parts.length > 0) contents.push({ role: "model", parts });
      continue;
    }
    // function responses come back on a USER turn, matched by name
    contents.push({
      role: "user",
      parts: turn.results.map((r) => ({
        functionResponse: { name: r.name, response: { result: r.content } },
      })),
    });
  }
  return contents;
}

export const googleAdapter: ProviderAdapter = {
  id: "google",
  label: "Gemini",

  configured: () => Boolean(process.env[KEY]),

  // All three are free-tier eligible (gemini-3.1-pro-preview is paid-only, so
  // the deep tier uses the newest Pro that the free tier actually covers).
  models: {
    fast: { id: "gemini-3.1-flash-lite", label: "Flash Lite 3.1", note: FREE_TIER_NOTE },
    balanced: { id: "gemini-3.5-flash", label: "Flash 3.5", note: FREE_TIER_NOTE },
    deep: { id: "gemini-2.5-pro", label: "Pro 2.5", note: FREE_TIER_NOTE },
  },

  async *stream(model, req): AsyncGenerator<AiStreamChunk> {
    const apiKey = process.env[KEY];
    if (!apiKey) {
      throw new Error(`${KEY} is not set — the Gemini provider is unavailable`);
    }
    const client = new GoogleGenAI({ apiKey });

    const stream = await client.models.generateContentStream({
      model,
      contents: toContents(req.turns),
      config: {
        systemInstruction: req.system,
        maxOutputTokens: req.maxTokens,
        ...(req.tools
          ? {
              tools: [
                {
                  functionDeclarations: req.tools.map((t) => ({
                    name: t.name,
                    description: t.description,
                    parametersJsonSchema: t.parameters,
                  })),
                },
              ],
            }
          : {}),
      },
    });

    let text = "";
    const calls: AiToolCall[] = [];
    let chunkIndex = 0;

    for await (const chunk of stream) {
      const delta = chunk.text;
      if (delta) {
        text += delta;
        yield { type: "text", text: delta };
      }
      const fnCalls = chunk.functionCalls ?? [];
      fnCalls.forEach((fc, i) => {
        if (!fc.name) return;
        calls.push({
          id: fc.id ?? synthesiseId(chunkIndex, i),
          name: fc.name,
          input: fc.args ?? {},
        });
      });
      chunkIndex++;
    }

    yield {
      type: "done",
      text,
      calls,
      stopReason: calls.length > 0 ? "tool_use" : "end_turn",
    };
  },
};
