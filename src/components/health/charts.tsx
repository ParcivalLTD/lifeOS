"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import type { HealthDayPoint, SleepNight } from "@/lib/data/health";

/**
 * Health trend charts — the same flat-bar language as the Gym e1RM and
 * Finance net-worth charts: no axes, no grid, latest bar inked, everything
 * else the inactive-bar grey. Sleep is the one stacked chart (stage
 * breakdown), rendered in a grayscale ramp — deep darkest → awake the track
 * colour — so the design system's no-gradient/flat rule holds.
 */

const TOOLTIP_STYLE = {
  border: "1px solid #d9d9d2",
  borderRadius: 0,
  fontFamily: "ui-monospace, Menlo, monospace",
  fontSize: 11,
  padding: "2px 6px",
} as const;

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const shortDate = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
};

export function EmptySeries({ text }: { text: string }) {
  return (
    <div className="px-3 py-6 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
      {text}
    </div>
  );
}

/** Generic day-series bar chart (weight, steps, resting HR, HRV, SpO2…). */
export function DaySeriesChart({
  points,
  unit,
  height = 64,
  decimals = 1,
}: {
  points: HealthDayPoint[];
  unit: string;
  height?: number;
  decimals?: number;
}) {
  const data = points.map((p) => ({ label: shortDate(p.dateISO), value: p.value }));
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // headroom below the smallest bar so the trend reads (gym-chart convention)
  const domainMin = Math.max(0, min - (max - min || min * 0.1) * 0.6);
  const fmt = (n: number) => n.toFixed(decimals).replace(/\.0+$/, "");

  return (
    <div className="px-3 pt-3 pb-2.5">
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barCategoryGap={4} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <YAxis hide domain={[domainMin, max]} />
            <Tooltip
              cursor={{ fill: "#ecece5" }}
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: "#8b8b80" }}
              formatter={(value) => {
                const n = typeof value === "number" ? value : Number(value);
                return [`${fmt(n)} ${unit}`, ""];
              }}
            />
            <Bar dataKey="value" isAnimationActive={false}>
              {data.map((_, i) => (
                <Cell key={i} fill={i === data.length - 1 ? "#1a1a18" : "#c9c9c0"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-faint">
        <span>{fmt(min)} {unit.toUpperCase()}</span>
        <span>{fmt(max)} {unit.toUpperCase()}</span>
      </div>
    </div>
  );
}

/** Sleep stage ramp — grayscale, darkest = deepest (flat fills, no gradient). */
export const STAGE_COLORS = {
  deep: "#1a1a18",
  rem: "#6e6e66",
  light: "#c9c9c0",
  awake: "#ecece5",
} as const;

const STAGES = [
  { key: "deep", label: "Deep" },
  { key: "rem", label: "REM" },
  { key: "light", label: "Light" },
  { key: "awake", label: "Awake" },
] as const;

/**
 * Nights as stacked stage bars (minutes). Nights that only have total hours
 * (manual logs) render as a single light-grey bar of hours×60 so mixed data
 * still reads as one series.
 */
export function SleepStagesChart({ nights }: { nights: SleepNight[] }) {
  const data = nights.map((n) => {
    const hasStages = n.deepMin !== null || n.remMin !== null || n.lightMin !== null;
    return {
      label: shortDate(n.dateISO),
      deep: hasStages ? n.deepMin ?? 0 : 0,
      rem: hasStages ? n.remMin ?? 0 : 0,
      light: hasStages ? n.lightMin ?? 0 : (n.hours ?? 0) * 60,
      awake: hasStages ? n.awakeMin ?? 0 : 0,
    };
  });
  const anyStages = nights.some(
    (n) => n.deepMin !== null || n.remMin !== null || n.lightMin !== null,
  );

  return (
    <div className="px-3 pt-3 pb-2.5">
      <div className="h-[84px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barCategoryGap={4} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <YAxis hide />
            <Tooltip
              cursor={{ fill: "#fafaf6" }}
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: "#8b8b80" }}
              formatter={(value, name) => {
                const n = typeof value === "number" ? value : Number(value);
                if (n === 0) return [null, null];
                const h = Math.floor(n / 60);
                const m = Math.round(n % 60);
                return [`${h ? `${h}h ` : ""}${m}m`, String(name)];
              }}
            />
            {STAGES.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="night"
                fill={STAGE_COLORS[s.key]}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {anyStages ? (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          {STAGES.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[.05em] text-faint">
              <span
                className="inline-block h-[7px] w-[7px] border border-border-input"
                style={{ background: STAGE_COLORS[s.key] }}
              />
              {s.label}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[.05em] text-faint">
          Total hours only — stage breakdown arrives with synced sleep
        </p>
      )}
    </div>
  );
}
