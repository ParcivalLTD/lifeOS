"use client";

import { AssistantChat } from "@/components/assistant-chat";
import { Panel } from "@/components/panel";
import Link from "next/link";
import type { ChatData } from "@/lib/tab-data";

export function ChatViewTab({ data }: { data: ChatData }) {
  return (
    <main className="mx-auto w-full max-w-[840px] p-4">
      {data.aiConfigured ? (
        <AssistantChat
          conversations={data.conversations}
          conversationId={data.conversationId}
          activeModelLabel={data.activeModelLabel}
          messages={data.messages}
          todayISO={data.todayISO}
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
  );
}
