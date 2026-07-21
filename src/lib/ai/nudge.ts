/**
 * Daily-nudge generation (FR-AI.3) — goes through the SAME assembler +
 * boundary as everything else in this layer. It is ADVISORY only (FR-AI.4):
 * `buildAiRequest` for the daily-nudge feature attaches NO tools, so the
 * response can only be text — there is no write affordance here at all. If
 * the owner wants to act on a nudge, they take it to the chat, where the
 * propose→approve path lives.
 *
 * Provider-agnostic: the nudge runs on the model the owner chose in Settings
 * — the same saved preference the chat uses — falling back to the first
 * configured provider if none is set. It is one short text generation per
 * day, so it has no picker of its own.
 *
 * Summary-only boundary intact: journal body text stays excluded by default.
 */
import { resolveForConversation, streamFromProvider } from "@/lib/ai/client";
import { getPreferences } from "@/lib/data/preferences";
import { assembleContext } from "@/lib/ai/context";
import { buildAiRequest } from "@/lib/ai/request";

/** One data-grounded observation for today, as plain text. */
export async function generateNudgeText(userId: string): Promise<string> {
  const prefs = await getPreferences(userId);
  const selection = resolveForConversation(prefs, null);
  if (!selection) {
    throw new Error("no AI provider is configured — the daily nudge is disabled");
  }

  const context = await assembleContext(userId, { feature: "daily-nudge" });
  const request = buildAiRequest(context, "daily-nudge");

  let text = "";
  for await (const chunk of streamFromProvider(
    selection.provider,
    selection.model,
    request,
  )) {
    if (chunk.type === "done") text = chunk.text;
  }
  return text.trim();
}
