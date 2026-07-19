import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { AssistantChat } from "@/components/assistant-chat";
import { Panel } from "@/components/panel";
import { aiConfigured } from "@/lib/ai/client";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "LIFEOS — ASSISTANT" };

export default async function AssistantPage() {
  await requireUser();
  const configured = aiConfigured();

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-[840px] p-4">
        {configured ? (
          <AssistantChat />
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
