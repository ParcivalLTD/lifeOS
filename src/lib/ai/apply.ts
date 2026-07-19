/**
 * The CONFIRMED-ACTION write path. This module runs ONLY from the Approve
 * server action — never from the model, never from the chat round-trip.
 *
 * Every apply re-validates the raw payload from scratch (`parseProposal`
 * builds a clean object; nothing model- or client-supplied is trusted),
 * then goes through the SAME forUser-wrapped data-layer create functions a
 * manual edit uses. Reject = this module is simply never called.
 */
import { describeProposal, parseProposal } from "@/lib/ai/proposals";
import { createEvent } from "@/lib/data/events";
import { createHabit } from "@/lib/data/habits";
import { createTask } from "@/lib/data/tasks";

export type ApplyResult = { ok: true; summary: string } | { ok: false; error: string };

export async function applyProposal(userId: string, raw: unknown): Promise<ApplyResult> {
  // full server-side re-validation at the moment of writing — the parse the
  // chat round did earlier is advisory; THIS one gates the write
  const parsed = parseProposal(raw);
  if (!parsed.ok) return { ok: false, error: `proposal rejected: ${parsed.error}` };
  const p = parsed.proposal;

  switch (p.action) {
    case "create_task":
      await createTask(userId, {
        title: p.title,
        domain: p.domain,
        dueDate: p.dueDate,
        priority: p.priority,
        recurrence: null,
      });
      break;
    case "create_event":
      await createEvent(userId, {
        title: p.title,
        domain: p.domain,
        kind: p.kind,
        dateISO: p.date,
        timeHM: p.time,
        endHM: p.endTime,
      });
      break;
    case "create_habit":
      await createHabit(userId, { title: p.title, domain: p.domain, schedule: p.schedule });
      break;
  }
  return { ok: true, summary: describeProposal(p) };
}
