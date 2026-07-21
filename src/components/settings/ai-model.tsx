"use client";

import { useState, useTransition } from "react";
import { saveAiModelAction } from "@/app/settings/actions";
import type { ProviderOption } from "@/lib/ai/providers";
import type { ProviderId, Tier } from "@/lib/ai/providers/types";

const selectCls =
  "border border-border-input bg-subtle px-2 py-1.5 font-mono text-[11px] disabled:opacity-50";

/**
 * Assistant model chooser. This is the ONLY place the provider and tier are
 * selected — the chat itself just shows which model is serving it.
 *
 * The choice is saved to the owner's preferences and applies to every NEW
 * conversation. An existing chat keeps the provider that served its first
 * reply: its transcript carries that vendor's tool-call ids, and the stored
 * approve/reject decisions are keyed on them.
 *
 * Providers without a configured API key never appear here at all.
 */
export function AiModelPanel({
  providers,
  provider: initialProvider,
  tier: initialTier,
}: {
  providers: ProviderOption[];
  provider: ProviderId | null;
  tier: Tier;
}) {
  const [provider, setProvider] = useState<ProviderId | null>(
    initialProvider ?? providers[0]?.id ?? null,
  );
  const [tier, setTier] = useState<Tier>(initialTier);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  if (providers.length === 0) {
    return (
      <p className="px-3 py-2.5 text-[12.5px]">
        No provider is configured. Set{" "}
        <span className="font-mono text-[11px]">ANTHROPIC_API_KEY</span>,{" "}
        <span className="font-mono text-[11px]">OPENAI_API_KEY</span> or{" "}
        <span className="font-mono text-[11px]">GOOGLE_AI_API_KEY</span> in the
        server environment to enable the assistant.
      </p>
    );
  }

  const tiers = providers.find((p) => p.id === provider)?.tiers ?? [];
  const activeModel = tiers.find((t) => t.tier === tier)?.model;

  const persist = (nextProvider: ProviderId, nextTier: Tier) => {
    setSaved(false);
    start(async () => {
      await saveAiModelAction(nextProvider, nextTier);
      setSaved(true);
    });
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-[12.5px]">
        Which model answers in the assistant. Applies to new chats — an
        existing chat stays on the provider that started it.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Provider"
          value={provider ?? ""}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value as ProviderId;
            const nextTiers = providers.find((p) => p.id === next)?.tiers ?? [];
            const nextTier = nextTiers.some((t) => t.tier === tier) ? tier : "balanced";
            setProvider(next);
            setTier(nextTier);
            persist(next, nextTier);
          }}
          className={selectCls}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Model tier"
          value={tier}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value as Tier;
            setTier(next);
            if (provider) persist(provider, next);
          }}
          className={selectCls}
        >
          {tiers.map((t) => (
            <option key={t.tier} value={t.tier}>
              {t.tier} — {t.label}
            </option>
          ))}
        </select>

        <span className="font-mono text-[10px] uppercase tracking-[.05em] text-faint">
          {pending ? "Saving…" : saved ? "Saved" : activeModel}
        </span>
      </div>
    </div>
  );
}
