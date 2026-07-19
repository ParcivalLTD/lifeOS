import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Panel } from "@/components/panel";
import { requireUser } from "@/lib/auth";
import { assembleContext } from "@/lib/ai/context";
import { buildAiRequest, AI_MODEL } from "@/lib/ai/request";

export const metadata: Metadata = { title: "LIFEOS — AI CONTEXT PREVIEW" };

/**
 * "What gets sent" audit page (Phase 4 boundary): renders the EXACT request
 * body `sendToClaude` would transmit for each feature — assembled fresh from
 * the same code path, serialized the same way. Nothing on this page sends
 * anything anywhere.
 */
export default async function AiPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ feature?: string }>;
}) {
  const user = await requireUser();
  const { feature: rawFeature } = await searchParams;
  const feature =
    rawFeature === "weekly-review-draft" || rawFeature === "daily-nudge"
      ? rawFeature
      : ("chat" as const);

  const context = await assembleContext(user.id, { feature });
  const request = buildAiRequest(context, feature);
  const serialized = JSON.stringify(request, null, 2);
  const bytes = new TextEncoder().encode(JSON.stringify(request)).length;

  return (
    <>
      <AppHeader />
      <main className="mx-auto flex w-full max-w-[860px] flex-col gap-3 p-4">
        <div className="bg-ink px-3 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#f2f2ee]">
          Preview only — nothing was sent to the API
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faint">
            AI context — what gets sent
          </span>
          <span className="font-mono text-[11px] text-muted">
            {AI_MODEL} · {(bytes / 1024).toFixed(1)} KB
          </span>
        </div>

        <div className="flex gap-1">
          {(["chat", "weekly-review-draft", "daily-nudge"] as const).map((f) => (
            <Link
              key={f}
              href={`/settings/ai-preview?feature=${f}`}
              className={`border px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[.06em] no-underline ${
                f === feature
                  ? "border-ink bg-ink text-[#ffffff]"
                  : "border-border-input bg-subtle text-ink"
              }`}
            >
              {f}
            </Link>
          ))}
        </div>

        <Panel label="Privacy boundary" value="NFR-1">
          <div className="flex flex-col gap-1 px-3 py-2.5 font-mono text-[10px] uppercase tracking-[.03em] text-faint">
            <span>
              Journal body text included:{" "}
              <span className="font-semibold text-ink">
                {context.meta.journalTextIncluded ? "YES" : "NO (default)"}
              </span>{" "}
              — journal contributes mood / energy / tags only unless a feature
              is explicitly opted in.
            </span>
            <span>Structured summaries only — no database rows, no record ids.</span>
            <span>
              API key is server-side (ANTHROPIC_API_KEY); the only code path
              that can send is src/lib/ai/client.ts.
            </span>
          </div>
        </Panel>

        <Panel label="Exact request body" value={`${serialized.split("\n").length} lines`}>
          <pre className="overflow-x-auto whitespace-pre px-3 py-2.5 font-mono text-[10.5px] leading-[1.5] text-ink">
            {serialized}
          </pre>
        </Panel>

        <Link href="/settings" className="font-mono text-[10px] uppercase tracking-[.06em] text-faint">
          ← Back to settings
        </Link>
      </main>
    </>
  );
}
