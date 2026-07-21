"use client";

import { Panel } from "@/components/panel";
import type { SleepAnalysis } from "@/lib/sleep";

/**
 * Sleep analysis panel (stage 4). Every figure shows its `basis` right under
 * the number (the review-system convention); anything the data can't support
 * renders "—" with the reason — no fabricated values, no composite score.
 */

const Basis = ({ text }: { text: string }) => (
  <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[.04em] text-faintest">
    {text}
  </p>
);

function StatRow({
  label,
  value,
  basis,
}: {
  label: string;
  value: string;
  basis: string;
}) {
  return (
    <div className="border-b border-border-row px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[.07em] text-faint">
          {label}
        </span>
        <span className="font-mono text-[13px] font-semibold">{value}</span>
      </div>
      <Basis text={basis} />
    </div>
  );
}

/** Flat range band: grey reference band, 2px ink marker at your average. */
function StageRow({
  label,
  avgPct,
  lo,
  hi,
  within,
}: {
  label: string;
  avgPct: number;
  lo: number;
  hi: number;
  within: boolean;
}) {
  const SCALE = 70; // % of sleep — full track width
  const clamp = (n: number) => Math.min(100, Math.max(0, (n / SCALE) * 100));
  return (
    <div className="flex items-center gap-2.5 border-b border-border-row px-3 py-2">
      <span className="w-[46px] flex-none font-mono text-[9px] font-semibold uppercase tracking-[.07em] text-faint">
        {label}
      </span>
      <div className="relative h-[8px] min-w-0 flex-1 bg-track">
        <div
          className="absolute inset-y-0 bg-[#c9c9c0]"
          style={{ left: `${clamp(lo)}%`, width: `${clamp(hi) - clamp(lo)}%` }}
        />
        <div
          className="absolute inset-y-[-2px] w-[2px] bg-ink"
          style={{ left: `calc(${clamp(avgPct)}% - 1px)` }}
        />
      </div>
      <span
        className={`w-[104px] flex-none text-right font-mono text-[10px] ${within ? "text-status-good" : "text-status-warn"}`}
      >
        {avgPct}% · ref {lo}–{hi}%
      </span>
    </div>
  );
}

export function SleepAnalysisPanel({ analysis }: { analysis: SleepAnalysis }) {
  const { trend, consistency, stages, patterns } = analysis;
  const min = (n: number) => `±${n}m`;

  return (
    <Panel
      label="Sleep analysis — last 30 nights"
      value={`${analysis.nightCount} night${analysis.nightCount === 1 ? "" : "s"}`}
    >
      <StatRow
        label="Avg duration · 7d"
        value={trend.avg7.value !== null ? `${trend.avg7.value} h` : "—"}
        basis={trend.avg7.basis}
      />
      <StatRow
        label="Avg duration · 30d"
        value={trend.avg30.value !== null ? `${trend.avg30.value} h` : "—"}
        basis={trend.avg30.basis}
      />
      <StatRow
        label="Consistency"
        value={
          consistency.wakeSdMin !== null && consistency.bedSdMin !== null
            ? `wake ${min(consistency.wakeSdMin)} · bed ${min(consistency.bedSdMin)}`
            : "—"
        }
        basis={consistency.basis}
      />

      <div className="border-b border-border-row px-3 pb-1 pt-2">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[.07em] text-faint">
          Stage balance
        </span>
        <Basis text={stages.basis} />
      </div>
      {stages.stages ? (
        stages.stages.map((s) => (
          <StageRow
            key={s.key}
            label={s.label}
            avgPct={s.avgPct}
            lo={s.lo}
            hi={s.hi}
            within={s.within}
          />
        ))
      ) : (
        <div className="border-b border-border-row px-3 py-2 font-mono text-[11px] text-faint">
          —
        </div>
      )}

      <div className="px-3 pb-3 pt-2">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[.07em] text-faint">
          Patterns
        </span>
        {patterns.flags.length > 0 ? (
          patterns.flags.map((f) => (
            <div key={f.text} className="mt-1.5">
              <p className="text-[12.5px]">{f.text}</p>
              <Basis text={f.basis} />
            </div>
          ))
        ) : (
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[.04em] text-faint">
            {patterns.note}
          </p>
        )}
      </div>
    </Panel>
  );
}
