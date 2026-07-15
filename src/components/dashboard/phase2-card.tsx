import { Panel } from "@/components/panel";

/**
 * Deferred-module empty state: honest blurb + ghost progress tracks.
 * No fake data — just the shape of what arrives with its phase.
 */
export function Phase2Card({ label, blurb }: { label: string; blurb: string }) {
  return (
    <Panel label={label} value="PHASE 2">
      <div className="flex flex-col gap-3 px-3 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[.06em] text-faint">
          {blurb}
        </p>
        <div className="flex flex-col gap-2.5 pb-1">
          {[82, 64, 45].map((w) => (
            <div key={w} className="h-1 bg-track" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    </Panel>
  );
}
