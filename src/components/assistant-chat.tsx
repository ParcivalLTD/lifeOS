"use client";

import { useRef, useState, useTransition } from "react";
import {
  applyProposalAction,
  chatAction,
  type ChatProposal,
} from "@/app/assistant/actions";
import type { Proposal } from "@/lib/ai/proposals";

type ProposalState = ChatProposal & {
  status: "pending" | "applied" | "rejected" | "failed";
  error?: string;
};

type Turn =
  | { role: "user"; text: string }
  | {
      role: "assistant";
      text: string;
      proposals: ProposalState[];
      invalid: string[];
      /** verbatim content blocks for the API replay */
      apiContent: unknown[];
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

function decisionSummary(proposals: ProposalState[]): string {
  if (proposals.length === 0) {
    return "No valid proposals were shown to the owner.";
  }
  const lines = proposals.map((p, i) => {
    const state =
      p.status === "applied"
        ? "APPROVED and applied"
        : p.status === "rejected"
          ? "REJECTED by the owner"
          : p.status === "failed"
            ? `approval FAILED validation (${p.error ?? "error"})`
            : "still PENDING (owner has not decided)";
    return `#${i + 1} ${p.description}: ${state}`;
  });
  return `Owner decisions on your proposals so far:\n${lines.join("\n")}`;
}

/** API replay of the conversation: assistant turns verbatim; a user turn
 * that follows tool_use blocks must lead with one tool_result per block. */
function toApiTurns(turns: Turn[], nextUserText: string) {
  const api: { role: "user" | "assistant"; content: string | unknown[] }[] = [];
  for (const t of turns) {
    if (t.role === "user") {
      api.push({ role: "user", content: t.text });
    } else {
      api.push({ role: "assistant", content: t.apiContent });
      const toolUseIds = t.apiContent
        .filter(
          (b): b is { type: "tool_use"; id: string } =>
            typeof b === "object" && b !== null &&
            (b as { type?: string }).type === "tool_use",
        )
        .map((b) => b.id);
      if (toolUseIds.length > 0) {
        api.push({
          role: "user",
          content: toolUseIds.map((id) => ({
            type: "tool_result",
            tool_use_id: id,
            content: decisionSummary(t.proposals.filter((p) => p.key.startsWith(id))),
          })),
        });
      }
    }
  }
  api.push({ role: "user", content: nextUserText });
  return api;
}

function ProposalCard({
  p,
  onDecide,
  busy,
}: {
  p: ProposalState;
  onDecide: (key: string, approve: boolean) => void;
  busy: boolean;
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

export function AssistantChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = (text: string) => {
    const message = text.trim();
    if (!message || isPending) return;
    setError(null);
    setInput("");
    const apiTurns = toApiTurns(turns, message);
    setTurns((t) => [...t, { role: "user", text: message }]);
    startTransition(async () => {
      const res = await chatAction(apiTurns);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          text: res.text,
          proposals: res.proposals.map((p) => ({ ...p, status: "pending" as const })),
          invalid: res.invalid,
          apiContent: res.assistantContent,
        },
      ]);
      queueMicrotask(() =>
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }),
      );
    });
  };

  const setProposal = (key: string, patch: Partial<ProposalState>) =>
    setTurns((all) =>
      all.map((t) =>
        t.role === "assistant"
          ? { ...t, proposals: t.proposals.map((p) => (p.key === key ? { ...p, ...patch } : p)) }
          : t,
      ),
    );

  const decide = (key: string, approve: boolean) => {
    if (!approve) {
      // Reject is purely local — no server call, nothing written anywhere
      setProposal(key, { status: "rejected" });
      return;
    }
    const proposal = turns
      .flatMap((t) => (t.role === "assistant" ? t.proposals : []))
      .find((p) => p.key === key)?.proposal;
    if (!proposal) return;
    startTransition(async () => {
      const res = await applyProposalAction(proposal);
      if (res.ok) setProposal(key, { status: "applied" });
      else setProposal(key, { status: "failed", error: res.error });
    });
  };

  return (
    <div className="border border-border-outer bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-header px-3 py-2.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faint">
          Assistant
        </span>
        <span className="font-mono text-[10px] text-faint">
          CONTEXT: GOALS · CALENDAR · BUDGETS · METRICS
        </span>
      </div>

      <div ref={scrollRef} className="flex min-h-[300px] flex-col gap-2.5 overflow-y-auto p-3.5">
        {turns.length === 0 && (
          <p className="font-mono text-[10px] uppercase tracking-[.04em] text-faint">
            Ask about your data — answers cite your own numbers. Changes it
            suggests become review cards you approve or reject.
          </p>
        )}
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[82%] whitespace-pre-wrap bg-ink px-3 py-2 text-[12.5px] text-[#f2f2ee]">
                {t.text}
              </div>
            </div>
          ) : (
            <div key={i} className="flex flex-col gap-2">
              {t.text && (
                <div className="flex justify-start">
                  <div className="max-w-[82%] whitespace-pre-wrap border border-[#e2e2da] bg-subtle px-3 py-2 text-[12.5px]">
                    {t.text}
                  </div>
                </div>
              )}
              {t.proposals.map((p) => (
                <div key={p.key} className="max-w-[82%]">
                  <ProposalCard p={p} onDecide={decide} busy={isPending} />
                </div>
              ))}
              {t.invalid.length > 0 && (
                <div className="max-w-[82%] font-mono text-[9px] uppercase tracking-[.04em] text-status-bad">
                  {t.invalid.length} malformed proposal{t.invalid.length === 1 ? "" : "s"} from
                  the model {t.invalid.length === 1 ? "was" : "were"} discarded (never applied)
                </div>
              )}
            </div>
          ),
        )}
        {isPending && (
          <div className="flex justify-start">
            <div className="border border-[#e2e2da] bg-subtle px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
              Thinking…
            </div>
          </div>
        )}
        {error && (
          <div className="border border-status-bad px-3 py-2 font-mono text-[10px] uppercase tracking-[.03em] text-status-bad">
            {error}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 px-3.5 pb-3">
        {CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            disabled={isPending}
            onClick={() => send(c)}
            className="cursor-pointer border border-border-input bg-subtle px-2.5 py-1 font-mono text-[11px] disabled:opacity-50"
          >
            {c}
          </button>
        ))}
      </div>

      <form
        className="flex gap-1.5 border-t border-border-header p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your data…"
          aria-label="Message the assistant"
          disabled={isPending}
          className="min-w-0 flex-1 border border-border-input bg-subtle px-2.5 py-2 text-[12.5px] disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isPending || input.trim().length === 0}
          className="cursor-pointer border-0 bg-ink px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#ffffff] disabled:opacity-50"
        >
          Send
        </button>
      </form>

      <div className="border-t border-border-row px-3 py-2 font-mono text-[9px] uppercase tracking-[.06em] text-faintest">
        Advisory only — nothing changes unless you approve a review card
      </div>
    </div>
  );
}
