/**
 * Daily-nudge generation (FR-AI.3) — goes through the SAME assembler +
 * boundary as everything else in this layer. It is ADVISORY only (FR-AI.4):
 * `buildAiRequest` for the daily-nudge feature attaches NO tools, so the
 * response can only be text — there is no write affordance here at all. If
 * the owner wants to act on a nudge, they take it to the chat, where the
 * propose→approve path lives.
 *
 * Summary-only boundary intact: journal body text stays excluded by default.
 */
import { sendToClaude } from "@/lib/ai/client";
import { assembleContext } from "@/lib/ai/context";
import { buildAiRequest } from "@/lib/ai/request";

/** One data-grounded observation for today, as plain text. */
export async function generateNudgeText(userId: string): Promise<string> {
  const context = await assembleContext(userId, { feature: "daily-nudge" });
  const response = await sendToClaude(buildAiRequest(context, "daily-nudge"));
  return response.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();
}
