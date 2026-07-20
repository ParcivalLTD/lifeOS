import { NextResponse } from "next/server";
import { aiConfigured, streamFromClaude } from "@/lib/ai/client";
import { assembleContext } from "@/lib/ai/context";
import { buildReplayTurns, proposalsFromBlocks } from "@/lib/ai/replay";
import { buildChatRequest } from "@/lib/ai/request";
import {
  appendMessage,
  createConversation,
  getConversation,
} from "@/lib/data/conversations";
import { createClient } from "@/lib/supabase/server";

/**
 * Streaming chat turn (FR-AI.1/2). Owner session required.
 *
 * Boundary unchanged: the outbound payload is still assembled ONLY by
 * `assembleContext` (journal excluded by default) and built by
 * `buildChatRequest`; `client.ts` remains the sole transport. Persisting the
 * transcript in the owner's own database does not widen what is sent.
 *
 * The server owns persistence — the user turn is stored before the request
 * goes out, and the assistant turn (with its verbatim blocks, including any
 * propose_changes tool calls) is stored when the stream completes.
 */
// No `maxDuration`: that was a Vercel serverless ceiling and is inert on the
// self-hosted server. It mattered most here — a long streamed reply was cut
// at 60s. See CLAUDE.md Infrastructure.

const MAX_TEXT = 4000;

const sse = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!aiConfigured()) {
    return NextResponse.json({ error: "not-configured" }, { status: 503 });
  }

  let payload: { conversationId?: unknown; text?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text || text.length > MAX_TEXT) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  // resolve the conversation (owner-scoped); create one on the first turn
  let conversationId =
    typeof payload.conversationId === "string" ? payload.conversationId : null;
  if (conversationId && !(await getConversation(user.id, conversationId))) {
    conversationId = null; // unknown/foreign/archived id — start fresh
  }
  if (!conversationId) conversationId = await createConversation(user.id);

  await appendMessage(user.id, conversationId, { role: "user", text });

  const conversation = await getConversation(user.id, conversationId);
  if (!conversation) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  const context = await assembleContext(user.id, { feature: "chat" });
  const request = buildChatRequest(context, buildReplayTurns(conversation.messages));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (d: unknown) => controller.enqueue(encoder.encode(sse(d)));
      send({ type: "start", conversationId, title: conversation.title });
      try {
        let full = "";
        for await (const chunk of streamFromClaude(request)) {
          if (chunk.type === "text") {
            full += chunk.text;
            send({ type: "text", text: chunk.text });
          } else {
            const messageId = await appendMessage(user.id, conversationId, {
              role: "assistant",
              text: full,
              blocks: chunk.blocks,
            });
            const { proposals, invalid } = proposalsFromBlocks(chunk.blocks);
            send({
              type: "done",
              conversationId,
              messageId,
              text: full,
              proposals,
              invalid,
              stopReason: chunk.stopReason,
            });
          }
        }
      } catch (err) {
        send({
          type: "error",
          error: err instanceof Error ? err.message : "Assistant request failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
    },
  });
}
