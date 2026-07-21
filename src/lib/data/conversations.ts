/**
 * Assistant conversation storage (Phase 4). Owner-scoped through forUser like
 * every other table (RLS-bypass rule), and included in the NFR-4 export.
 *
 * Storing history in the owner's OWN database does not widen the outbound
 * boundary: what gets SENT to the API is still assembled only by
 * `lib/ai/context.ts` (journal excluded by default). These rows are the
 * transcript, not the payload.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { forUser } from "@/db";
import { conversationMessages, conversations } from "@/db/schema";
import type { ProviderId, Tier } from "@/lib/ai/providers/types";

export type ChatRole = "user" | "assistant";

export type StoredMessage = {
  id: string;
  role: ChatRole;
  text: string;
  /** Canonical AiToolCall records for assistant turns (legacy rows may still
   * hold raw Anthropic content blocks — `callsFromStored` reads both). */
  blocks: unknown[] | null;
  /** {"<callId>:<index>": "approved" | "rejected"} */
  decisions: Record<string, string>;
  /** Which vendor + exact model produced this turn; null for user turns. */
  provider: ProviderId | null;
  model: string | null;
  createdAt: string;
};

export type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
  /** Locked once the conversation has an assistant turn; null while empty. */
  provider: ProviderId | null;
  tier: Tier | null;
};

export type ConversationDetail = ConversationSummary & {
  messages: StoredMessage[];
};

const DEFAULT_TITLE = "New chat";
const MAX_TITLE = 60;

/** First user message → a short title (auto-title, FR: history is scannable). */
export function titleFromText(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return DEFAULT_TITLE;
  return clean.length <= MAX_TITLE ? clean : `${clean.slice(0, MAX_TITLE - 1)}…`;
}

const toMessage = (row: typeof conversationMessages.$inferSelect): StoredMessage => ({
  id: row.id,
  role: row.role,
  text: row.text,
  blocks: (row.blocks as unknown[] | null) ?? null,
  decisions: (row.decisions as Record<string, string> | null) ?? {},
  provider: (row.provider as ProviderId | null) ?? null,
  model: row.model ?? null,
  createdAt: row.createdAt.toISOString(),
});

/** Non-archived conversations, most recently active first. */
export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  const rows = await forUser(userId).select(conversations, {
    where: eq(conversations.archived, false),
    orderBy: [desc(conversations.updatedAt)],
  });
  return rows.map((c) => ({
    id: c.id,
    title: c.title,
    updatedAt: c.updatedAt.toISOString(),
    provider: (c.provider as ProviderId | null) ?? null,
    tier: (c.tier as Tier | null) ?? null,
  }));
}

export async function getConversation(
  userId: string,
  id: string,
): Promise<ConversationDetail | null> {
  const udb = forUser(userId);
  const [row] = await udb.select(conversations, { where: eq(conversations.id, id) });
  if (!row || row.archived) return null;
  const messages = await udb.select(conversationMessages, {
    where: eq(conversationMessages.conversationId, id),
    orderBy: [asc(conversationMessages.createdAt)],
  });
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    provider: (row.provider as ProviderId | null) ?? null,
    tier: (row.tier as Tier | null) ?? null,
    messages: messages.map(toMessage),
  };
}

/**
 * Bind a conversation to a provider + tier.
 *
 * The provider is written ONCE and never overwritten: a transcript carries
 * that vendor's tool-call ids, and the owner's stored decisions are keyed on
 * them, so re-serving it through a different vendor's conventions is not
 * something we can promise is faithful. The tier is free to change — it only
 * picks a different model within the already-locked provider.
 */
export async function setConversationSelection(
  userId: string,
  conversationId: string,
  provider: ProviderId,
  tier: Tier,
): Promise<void> {
  const udb = forUser(userId);
  const [row] = await udb.select(conversations, {
    where: eq(conversations.id, conversationId),
  });
  if (!row) return;
  await udb.update(
    conversations,
    { provider: row.provider ?? provider, tier },
    eq(conversations.id, conversationId),
  );
}

export async function createConversation(userId: string, title?: string): Promise<string> {
  const [row] = await forUser(userId).insert(conversations, {
    domain: "personal",
    title: title ? titleFromText(title) : DEFAULT_TITLE,
  });
  return row.id;
}

/** Bumps updatedAt so the conversation floats to the top of history. */
async function touch(userId: string, conversationId: string): Promise<void> {
  await forUser(userId).update(
    conversations,
    { updatedAt: new Date() },
    eq(conversations.id, conversationId),
  );
}

export async function appendMessage(
  userId: string,
  conversationId: string,
  message: {
    role: ChatRole;
    text: string;
    blocks?: unknown[] | null;
    provider?: ProviderId | null;
    model?: string | null;
  },
): Promise<string> {
  const udb = forUser(userId);
  const [row] = await udb.insert(conversationMessages, {
    conversationId,
    role: message.role,
    text: message.text,
    blocks: message.blocks ?? null,
    provider: message.provider ?? null,
    model: message.model ?? null,
  });

  // auto-title from the first user message
  if (message.role === "user") {
    const [conv] = await udb.select(conversations, {
      where: eq(conversations.id, conversationId),
    });
    if (conv && conv.title === DEFAULT_TITLE && message.text.trim()) {
      await udb.update(
        conversations,
        { title: titleFromText(message.text), updatedAt: new Date() },
        eq(conversations.id, conversationId),
      );
      return row.id;
    }
  }
  await touch(userId, conversationId);
  return row.id;
}

/** Records the owner's decision on one proposal (confirmed-action state that
 * must survive reload — the write itself already happened via apply.ts). */
export async function recordDecision(
  userId: string,
  messageId: string,
  proposalKey: string,
  decision: "approved" | "rejected",
): Promise<void> {
  const udb = forUser(userId);
  const [row] = await udb.select(conversationMessages, {
    where: eq(conversationMessages.id, messageId),
  });
  if (!row) return;
  const decisions = { ...((row.decisions as Record<string, string> | null) ?? {}) };
  decisions[proposalKey] = decision;
  await udb.update(
    conversationMessages,
    { decisions },
    eq(conversationMessages.id, messageId),
  );
}

export async function renameConversation(
  userId: string,
  id: string,
  title: string,
): Promise<void> {
  await forUser(userId).update(
    conversations,
    { title: titleFromText(title) },
    eq(conversations.id, id),
  );
}

/**
 * Archive-then-delete: the owner-facing delete ARCHIVES (soft — the row and
 * its transcript stay in the database and in the NFR-4 export, matching the
 * app-wide "prefer archive over destructive delete" rule). `purgeConversation`
 * is the second step: a hard delete that cascades the messages away.
 */
export async function archiveConversation(userId: string, id: string): Promise<void> {
  await forUser(userId).update(
    conversations,
    { archived: true },
    eq(conversations.id, id),
  );
}

export async function purgeConversation(userId: string, id: string): Promise<void> {
  // messages cascade via the FK; scoped to archived rows so a live chat can
  // never be hard-deleted without being archived first
  await forUser(userId).delete(
    conversations,
    and(eq(conversations.id, id), eq(conversations.archived, true)),
  );
}
