import "server-only";

import { anthropicAdapter } from "./anthropic";
import { googleAdapter } from "./google";
import { openaiAdapter } from "./openai";
import {
  isProviderId,
  isTier,
  TIERS,
  type ModelChoice,
  type ProviderAdapter,
  type ProviderId,
  type Tier,
} from "./types";

/**
 * The provider registry — the only place that knows which adapters exist.
 *
 * An unconfigured provider (no API key in the server environment) is simply
 * ABSENT from `availableProviders()`, so it never reaches the picker and can
 * never be selected. Selecting one is therefore not an error state the UI has
 * to render; it just isn't offered.
 */

const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  google: googleAdapter,
};

/** Preference order — the first configured one becomes the default. */
const ORDER: ProviderId[] = ["anthropic", "openai", "google"];

export const getAdapter = (id: ProviderId): ProviderAdapter => ADAPTERS[id];

/** Serializable description of one provider, safe to hand to a client
 * component — model ids and labels only, never keys. */
export type ProviderOption = {
  id: ProviderId;
  label: string;
  tiers: { tier: Tier; model: string; label: string }[];
};

const describe = (a: ProviderAdapter): ProviderOption => ({
  id: a.id,
  label: a.label,
  tiers: TIERS.map((tier) => {
    const m: ModelChoice = a.models[tier];
    return { tier, model: m.id, label: m.label };
  }),
});

/** Every provider with a key configured, in preference order. */
export function availableProviders(): ProviderOption[] {
  return ORDER.filter((id) => ADAPTERS[id].configured()).map((id) =>
    describe(ADAPTERS[id]),
  );
}

export const anyProviderConfigured = (): boolean =>
  ORDER.some((id) => ADAPTERS[id].configured());

/** First configured provider, or null when the AI layer is entirely off. */
export function defaultProvider(): ProviderId | null {
  return ORDER.find((id) => ADAPTERS[id].configured()) ?? null;
}

export const DEFAULT_TIER: Tier = "balanced";

/**
 * Resolve a (provider, tier) selection into something sendable, falling back
 * to the default provider when the requested one isn't configured — a stored
 * conversation must stay usable if its provider's key is later removed.
 */
export function resolveSelection(
  provider: unknown,
  tier: unknown,
): { provider: ProviderId; tier: Tier; model: string } | null {
  const fallback = defaultProvider();
  if (!fallback) return null;

  const wanted = isProviderId(provider) && ADAPTERS[provider].configured()
    ? provider
    : fallback;
  const t = isTier(tier) ? tier : DEFAULT_TIER;
  return { provider: wanted, tier: t, model: ADAPTERS[wanted].models[t].id };
}

/**
 * The owner's saved choice from Settings, resolved into something sendable.
 *
 * `lockedProvider` wins when present: a conversation that already has an
 * assistant turn stays on the vendor that produced it, because its stored
 * tool-call ids (and the decisions keyed on them) belong to that vendor's
 * conventions. Everything else follows the saved preference, and anything
 * unset or no-longer-configured falls back rather than erroring.
 */
export function resolveForConversation(
  saved: { aiProvider?: ProviderId; aiTier?: Tier },
  lockedProvider?: ProviderId | null,
): { provider: ProviderId; tier: Tier; model: string } | null {
  return resolveSelection(lockedProvider ?? saved.aiProvider, saved.aiTier);
}

export type { ProviderId, Tier };
