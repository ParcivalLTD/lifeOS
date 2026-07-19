"use client";

import { setNudgeEnabledAction } from "@/app/nudge/actions";

/** Enable/disable the dashboard daily nudge (FR-AI.3). Submits the flipped
 * value through the server action, which revalidates the dashboard. */
export function NudgeToggle({ enabled }: { enabled: boolean }) {
  return (
    <form action={setNudgeEnabledAction} className="flex flex-wrap items-center gap-2.5">
      <input type="hidden" name="enabled" value={(!enabled).toString()} />
      <span className="font-mono text-[10px] uppercase tracking-[.06em] text-faint">
        Daily nudge:{" "}
        <span className="font-semibold text-ink">{enabled ? "ON" : "OFF"}</span>
      </span>
      <button
        type="submit"
        className="cursor-pointer border border-border-input bg-subtle px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[.06em]"
      >
        {enabled ? "Turn off" : "Turn on"}
      </button>
    </form>
  );
}
