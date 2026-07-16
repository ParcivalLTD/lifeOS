"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { round1 } from "@/lib/gym";
import type { LiftPoint } from "@/lib/data/gym";

/** Flat bar chart of a lift's e1RM over the last weeks; current bar is inked. */
export function E1rmChart({ points, unit = "kg" }: { points: LiftPoint[]; unit?: string }) {
  if (points.length === 0) {
    return (
      <div className="px-3 py-6 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
        No logged sets yet for this lift
      </div>
    );
  }

  const data = points.map((p) => ({ label: p.dateISO, value: p.value }));
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // headroom below the smallest bar so progression is visible (mockup style)
  const domainMin = Math.max(0, min - (max - min || min * 0.1) * 0.6);

  return (
    <div className="px-3 pt-3 pb-2.5">
      <div className="h-[64px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barCategoryGap={4} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <YAxis hide domain={[domainMin, max]} />
            <Tooltip
              cursor={{ fill: "#ecece5" }}
              contentStyle={{
                border: "1px solid #d9d9d2",
                borderRadius: 0,
                fontFamily: "ui-monospace, Menlo, monospace",
                fontSize: 11,
                padding: "2px 6px",
              }}
              labelStyle={{ color: "#8b8b80" }}
              formatter={(value) => {
                const n = typeof value === "number" ? value : Number(value);
                return [`${round1(n)} ${unit}`, ""];
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
        <span>{round1(min)} {unit.toUpperCase()}</span>
        <span>{round1(max)} {unit.toUpperCase()}</span>
      </div>
    </div>
  );
}
