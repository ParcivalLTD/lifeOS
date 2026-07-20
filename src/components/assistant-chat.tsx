"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  applyProposalAction,
  deleteConversationAction,
  rejectProposalAction,
} from "@/app/assistant/actions";
import { Collapse } from "@/components/disclosure-panel";
import { Panel } from "@/components/panel";
import type { Proposal } from "@/lib/ai/proposals";
import type { ConversationSummary } from "@/lib/data/conversations";

/** A stored message prepared server-side for rendering: proposals already
 * parsed out of the persisted blocks, with the owner's recorded decisions. */
export type ChatMessageView = {
  id: string;
  role: "user" | "assistant";
  text: string;
  decisions: Record<string, string>;
  proposals: { key: string; description: string; proposal: Proposal }[];
};

type ProposalView = {
  key: string;
  description: string;
  proposal: Proposal;
  status: "pending" | "applied" | "rejected" | "failed";
  error?: string;
};

type Turn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  proposals: ProposalView[];
  invalid: string[];
};

const CHIPS = [
  "Plan my study week around work",
  "Why is eating out over budget?",
  "Draft my weekly review",
];

const ACTION_LABEL: Record<Proposal["action"], string> = {
  create_task: "Create task",
  create_event: "Create event",
  create_habit: "Create habit",
};

/** The exact field rows a proposal would write — the review diff. */
function proposalFields(p: Proposal): [string, string][] {
  switch (p.action) {
    case "create_task":
      return [
        ["title", p.title],
        ["domain", p.domain],
        ["due", p.dueDate ?? "—"],
        ["priority", `P${p.priority}`],
      ];
    case "create_event":
      return [
        ["title", p.title],
        ["domain", p.domain],
        ["kind", p.kind],
        ["date", p.date],
        ["time", p.time ? `${p.time}${p.endTime ? `–${p.endTime}` : ""}` : "all-day"],
      ];
    case "create_habit":
      return [
        ["title", p.title],
        ["domain", p.domain],
        [
          "schedule",
          p.schedule.type === "daily"
            ? "daily"
            : p.schedule.type === "weekly_days"
              ? p.schedule.days.join(" / ")
              : `${p.schedule.times}× / week`,
        ],
      ];
  }
}

const relativeDay = (iso: string, todayISO: string): string => {
  const d = iso.slice(0, 10);
  if (d === todayISO) return "TODAY";
  const days = Math.round((Date.parse(todayISO) - Date.parse(d)) / 86_400_000);
  if (days === 1) return "YESTERDAY";
  if (days < 7) return `${days}D AGO`;
  return d.slice(5).replace("-", "/");
};

function ProposalCard({
  p,
  busy,
  onDecide,
}: {
  p: ProposalView;
  busy: boolean;
  onDecide: (key: string, approve: boolean) => void;
}) {
  return (
    <div className="border border-border-outer bg-surface">
      <div className="flex items-baseline justify-between gap-3 border-b border-border-header px-3 py-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faint">
          Proposal — {ACTION_LABEL[p.proposal.action]}
        </span>
        {p.status === "applied" && (
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[.07em] text-status-good">
            Applied ✓
          </span>
        )}
        {p.status === "rejected" && (
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[.07em] text-faint">
            Rejected
          </span>
        )}
        {p.status === "failed" && (
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[.07em] text-status-bad">
            Failed
          </span>
        )}
      </div>
      {proposalFields(p.proposal).map(([k, v]) => (
        <div key={k} className="flex items-baseline gap-2.5 border-b border-border-row px-3 py-1.5">
          <span className="w-3 flex-none font-mono text-[11px] font-semibold text-status-good">+</span>
          <span className="w-[72px] flex-none font-mono text-[9px] font-semibold uppercase tracking-[.07em] text-faint">
            {k}
          </span>
          <span className="min-w-0 flex-1 text-[12.5px]">{v}</span>
        </div>
      ))}
      {p.status === "failed" && p.error && (
        <div className="border-b border-border-row px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.03em] text-status-bad">
          {p.error}
        </div>
      )}
      {p.status === "pending" && (
        <div className="flex gap-1.5 p-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide(p.key, true)}
            className="cursor-pointer border-0 bg-ink px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[.06em] text-[#ffffff] disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide(p.key, false)}
            className="cursor-pointer border border-border-input bg-subtle px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[.06em] disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

export function AssistantChat({
  conversations,
  conversationId: initialConversationId,
  messages,
  todayISO,
}: {
  conversations: ConversationSummary[];
  conversationId: string | null;
  messages: ChatMessageView[];
  todayISO: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [conversationId, setConversationId] = useState(initialConversationId);
  const [turns, setTurns] = useState<Turn[]>(() => hydrate(messages));
  const [streaming, setStreaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  // Navigating to another conversation (or to a fresh one) re-seeds from the
  // server — adjusted during render, which is the sanctioned pattern for
  // syncing state to a changed prop.
  const [syncedFor, setSyncedFor] = useState(initialConversationId);
  if (syncedFor !== initialConversationId) {
    setSyncedFor(initialConversationId);
    setConversationId(initialConversationId);
    setTurns(hydrate(messages));
    setStreaming(null);
    setError(null);
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, streaming]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setError(null);
    setInput("");
    setBusy(true);
    setTurns((t) => [
      ...t,
      { id: `local-${Date.now()}`, role: "user", text: message, proposals: [], invalid: [] },
    ]);
    setStreaming("");

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, text: message }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error === "not-configured"
            ? "ANTHROPIC_API_KEY is not configured on the server."
            : "Assistant request failed.",
        );
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let newId: string | null = null;

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const evt = JSON.parse(line.slice(5).trim());
          if (evt.type === "start") {
            newId = evt.conversationId;
            setConversationId(evt.conversationId);
          } else if (evt.type === "text") {
            acc += evt.text;
            setStreaming(acc);
          } else if (evt.type === "error") {
            throw new Error(evt.error);
          } else if (evt.type === "done") {
            setStreaming(null);
            setTurns((t) => [
              ...t,
              {
                id: evt.messageId,
                role: "assistant",
                text: evt.text,
                proposals: (evt.proposals ?? []).map(
                  (p: { key: string; description: string; proposal: Proposal }) => ({
                    ...p,
                    status: "pending" as const,
                  }),
                ),
                invalid: evt.invalid ?? [],
              },
            ]);
          }
        }
      }

      // keep the URL resumable without remounting the chat
      if (newId && newId !== initialConversationId) {
        window.history.replaceState(null, "", `/assistant?c=${newId}`);
        startTransition(() => router.refresh());
      }
    } catch (e) {
      setStreaming(null);
      setError(e instanceof Error ? e.message : "Assistant request failed.");
    } finally {
      setBusy(false);
    }
  };

  const decide = (turnId: string, key: string, approve: boolean) => {
    const turn = turns.find((t) => t.id === turnId);
    const target = turn?.proposals.find((p) => p.key === key);
    if (!target) return;
    const patch = (status: ProposalView["status"], errorText?: string) =>
      setTurns((all) =>
        all.map((t) =>
          t.id === turnId
            ? {
                ...t,
                proposals: t.proposals.map((p) =>
                  p.key === key ? { ...p, status, error: errorText } : p,
                ),
              }
            : t,
        ),
      );

    startTransition(async () => {
      if (!approve) {
        patch("rejected");
        await rejectProposalAction(turnId, key);
        return;
      }
      const res = await applyProposalAction(target.proposal, turnId, key);
      if (res.ok) patch("applied");
      else patch("failed", res.error);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* history — collapsed by default so the chat owns the screen on mobile */}
      <Panel
        label="Assistant"
        value={`${conversations.length} chat${conversations.length === 1 ? "" : "s"}`}
        actions={
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              aria-label="Chat history"
              aria-expanded={showHistory}
              onClick={() => setShowHistory((v) => !v)}
              className={`cursor-pointer border-0 bg-transparent p-0 font-mono text-[10px] font-semibold uppercase tracking-[.06em] ${
                showHistory ? "text-ink" : "text-faint"
              }`}
            >
              History
            </button>
            <button
              type="button"
              onClick={() => {
                // clear locally *and* navigate: a Link to /assistant no-ops
                // when the router already considers us to be there
                setConversationId(null);
                setTurns([]);
                setStreaming(null);
                setError(null);
                setShowHistory(false);
                router.push("/assistant");
              }}
              className="cursor-pointer border-0 bg-ink px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[.06em] text-[#ffffff]"
            >
              New chat
            </button>
          </div>
        }
      >
        <Collapse open={showHistory}>
          <div>
            {conversations.length === 0 && (
              <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
                No saved chats yet
              </p>
            )}
            {conversations.map((c) => (
              <div
                key={c.id}
                className={`flex items-baseline gap-2.5 border-b border-border-row px-3 py-2 ${
                  c.id === conversationId ? "bg-subtle" : ""
                }`}
              >
                <Link
                  href={`/assistant?c=${c.id}`}
                  className="min-w-0 flex-1 truncate text-[12.5px] no-underline"
                >
                  {c.title}
                </Link>
                <span className="flex-none font-mono text-[10px] uppercase text-faint">
                  {relativeDay(c.updatedAt, todayISO)}
                </span>
                <button
                  type="button"
                  aria-label={`Delete "${c.title}"`}
                  onClick={() =>
                    startTransition(async () => {
                      await deleteConversationAction(c.id);
                      if (c.id === conversationId) router.push("/assistant");
                      else router.refresh();
                    })
                  }
                  className="-m-1.5 flex-none cursor-pointer border-0 bg-transparent p-1.5 font-mono text-[11px] leading-none text-faintest"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </Collapse>

        {/* transcript */}
        <div className="flex flex-col gap-2.5 p-3.5">
          {turns.length === 0 && streaming == null && (
            <p className="font-mono text-[10px] uppercase tracking-[.04em] text-faint">
              Ask about your data — answers cite your own numbers. Changes Assistant
              suggests become review cards you approve or reject.
            </p>
          )}

          {turns.map((t) =>
            t.role === "user" ? (
              <div key={t.id} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap bg-ink px-3 py-2 text-[12.5px] text-[#f2f2ee]">
                  {t.text}
                </div>
              </div>
            ) : (
              <div key={t.id} className="flex flex-col gap-2">
                {t.text && (
                  <div className="max-w-[92%] whitespace-pre-wrap border-l-2 border-border-outer pl-3 text-[12.5px]">
                    {t.text}
                  </div>
                )}
                {t.proposals.map((p) => (
                  <div key={p.key} className="max-w-[92%]">
                    <ProposalCard p={p} busy={busy} onDecide={(k, a) => decide(t.id, k, a)} />
                  </div>
                ))}
                {t.invalid.length > 0 && (
                  <div className="font-mono text-[9px] uppercase tracking-[.04em] text-status-bad">
                    {t.invalid.length} malformed proposal
                    {t.invalid.length === 1 ? "" : "s"} discarded (never applied)
                  </div>
                )}
              </div>
            ),
          )}

          {streaming != null && (
            <div className="max-w-[92%] whitespace-pre-wrap border-l-2 border-border-outer pl-3 text-[12.5px]">
              {streaming}
              <span className="ml-0.5 inline-block h-[12px] w-[7px] translate-y-[1px] bg-ink" />
            </div>
          )}

          {error && (
            <div className="border border-status-bad px-3 py-2 font-mono text-[10px] uppercase tracking-[.03em] text-status-bad">
              {error}
            </div>
          )}
          <div ref={endRef} />
        </div>

        {turns.length === 0 && (
          <div className="flex flex-wrap gap-1.5 px-3.5 pb-3">
            {CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                disabled={busy}
                onClick={() => send(c)}
                className="cursor-pointer border border-border-input bg-subtle px-2.5 py-1 font-mono text-[11px] disabled:opacity-50"
              >
                {c}
              </button>
            ))}
          </div>
        )}

        <form
          className="flex gap-1.5 border-t border-border-header p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Assistant…"
            aria-label="Message Assistant"
            disabled={busy}
            className="min-w-0 flex-1 border border-border-input bg-subtle px-2.5 py-2 text-[12.5px] disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy || input.trim().length === 0}
            className="cursor-pointer border-0 bg-ink px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#ffffff] disabled:opacity-50"
          >
            {busy ? "…" : "Send"}
          </button>
        </form>

        <div className="border-t border-border-row px-3 py-2 font-mono text-[9px] uppercase tracking-[.06em] text-faintest">
          Advisory only — nothing changes unless you approve a review card ·
          history saved to your database
        </div>
      </Panel>
    </div>
  );
}

/** Stored messages → renderable turns, restoring each proposal's decision so
 * a resumed chat shows exactly what was approved/rejected (and re-applies
 * nothing). */
function hydrate(messages: ChatMessageView[]): Turn[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    text: m.text,
    invalid: [],
    proposals: m.proposals.map((p) => ({
      ...p,
      status:
        m.decisions[p.key] === "approved"
          ? ("applied" as const)
          : m.decisions[p.key] === "rejected"
            ? ("rejected" as const)
            : ("pending" as const),
    })),
  }));
}
