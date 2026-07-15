/**
 * Assistant nudge slot (FR-AI.3) — static placeholder until Phase 4.
 * Inverted banner per the mockup: ink background, paper text.
 */
export function NudgeBanner() {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 bg-ink px-3.5 py-2.5 text-inverse">
      <span className="flex-none font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faintest">
        Assistant
      </span>
      <span className="min-w-[260px] flex-1 text-[12.5px]">
        Data-grounded nudges land here in Phase 4 — one short, cross-domain
        suggestion each morning.
      </span>
      <span className="flex-none border border-[#3a3a36] px-[5px] py-px font-mono text-[9px] font-semibold tracking-[.06em] text-faintest">
        PHASE 4
      </span>
    </div>
  );
}
