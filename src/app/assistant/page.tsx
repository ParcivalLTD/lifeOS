import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { AssistantChat, type ChatMessageView } from "@/components/assistant-chat";
import { Panel } from "@/components/panel";
import { ASSISTANT_SEGMENTS, Segmented } from "@/components/segmented";
import { aiConfigured, availableProviders, DEFAULT_TIER } from "@/lib/ai/client";
import { proposalsFromBlocks } from "@/lib/ai/replay";
import { requireUser } from "@/lib/auth";
import { getConversation, listConversations } from "@/lib/data/conversations";
import { todayISO } from "@/lib/dates";

export const metadata: Metadata = { title: "HELM — ASSISTANT" };

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const user = await requireUser();
  const { c } = await searchParams;

  const [conversations, active] = await Promise.all([
    listConversations(user.id),
    c ? getConversation(user.id, c) : Promise.resolve(null),
  ]);

  // parse each stored assistant turn's proposals server-side so a resumed
  // chat renders its review cards (and their decisions) without a round-trip
  const messages: ChatMessageView[] = (active?.messages ?? []).map((m) => ({
    id: m.id,
    role: m.role,
    text: m.text,
    decisions: m.decisions,
    proposals:
      m.role === "assistant"
        ? proposalsFromBlocks(m.blocks).proposals.map((p) => ({
            key: p.key,
            description: p.description,
            proposal: p.proposal,
          }))
        : [],
  }));

  return (
    <>
      <AppHeader />
      <Segmented segments={ASSISTANT_SEGMENTS} active="chat" width={840} />
      <main className="mx-auto w-full max-w-[840px] p-4">
        {aiConfigured() ? (
          <AssistantChat
            conversations={conversations}
            conversationId={active?.id ?? null}
            providers={availableProviders()}
            lockedProvider={active?.provider ?? null}
            initialTier={active?.tier ?? DEFAULT_TIER}
            messages={messages}
            todayISO={todayISO()}
          />
        ) : (
          <Panel label="Assistant" value="NOT CONFIGURED">
            <div className="flex flex-col gap-2 p-4">
              <p className="text-[12.5px]">
                Set <span className="font-mono text-[11px]">ANTHROPIC_API_KEY</span>{" "}
                in the server environment to enable the assistant. Until then
                nothing can be sent — you can still audit exactly what a
                request would contain.
              </p>
              <Link
                href="/settings/ai-preview"
                className="self-start font-mono text-[10px] font-semibold uppercase tracking-[.06em]"
              >
                Preview what gets sent →
              </Link>
            </div>
          </Panel>
        )}
      </main>
    </>
  );
}
