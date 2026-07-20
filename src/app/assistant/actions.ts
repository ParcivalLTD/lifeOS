"use server";

import { revalidatePath } from "next/cache";
import { applyProposal, type ApplyResult } from "@/lib/ai/apply";
import { requireUser } from "@/lib/auth";
import {
  archiveConversation,
  recordDecision,
  renameConversation,
} from "@/lib/data/conversations";

/**
 * The ONLY write path in the assistant (CONFIRMED-ACTION): runs when the
 * owner taps Approve on one review card. Re-validates the payload from
 * scratch and writes through the same forUser create functions as a manual
 * edit. Reject never calls this.
 *
 * The decision is then persisted on the message so a resumed conversation
 * shows what was actually decided — and never re-applies anything.
 */
export async function applyProposalAction(
  raw: unknown,
  messageId?: string,
  proposalKey?: string,
): Promise<ApplyResult> {
  const user = await requireUser();
  const result = await applyProposal(user.id, raw);
  if (result.ok) {
    if (messageId && proposalKey) {
      await recordDecision(user.id, messageId, proposalKey, "approved");
    }
    revalidatePath("/");
    revalidatePath("/tasks");
    revalidatePath("/calendar");
    revalidatePath("/habits");
  }
  return result;
}

/** Reject: records the decision only — no data is ever written. */
export async function rejectProposalAction(
  messageId: string,
  proposalKey: string,
): Promise<void> {
  const user = await requireUser();
  if (!messageId || !proposalKey) return;
  await recordDecision(user.id, messageId, proposalKey, "rejected");
}

/** Archive-then-delete: archiving is the owner-facing delete; the transcript
 * stays in the database and in the NFR-4 export. */
export async function deleteConversationAction(id: string): Promise<void> {
  const user = await requireUser();
  if (!id) return;
  await archiveConversation(user.id, id);
  revalidatePath("/assistant");
}

export async function renameConversationAction(id: string, title: string): Promise<void> {
  const user = await requireUser();
  if (!id || !title.trim()) return;
  await renameConversation(user.id, id, title);
  revalidatePath("/assistant");
}
