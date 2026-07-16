"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { fmtMoney, monthLabel } from "@/lib/finance";
import type { NetWorthPoint } from "@/lib/data/finance";

/** Flat monthly bar chart; latest month inked (mockup net-worth panel). */
export function NetWorthChart({ points }: { points: NetWorthPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="px-3 py-4 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
        Add accounts to start tracking net worth
      </div>
    );
  }
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const domainMin = Math.max(0, min - (max - min || min * 0.1) * 0.6);
  const data = points.map((p) => ({ label: monthLabel(p.monthKey), value: p.value }));

  return (
    <div>
      <div className="h-[56px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barCategoryGap={4} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <YAxis hide domain={[domainMin, max]} />
            <Tooltip
              cursor={{ fill: "#ecece5" }}
              contentStyle={{ border: "1px solid #d9d9d2", borderRadius: 0, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, padding: "2px 6px" }}
              labelStyle={{ color: "#8b8b80" }}
              formatter={(value) => {
                const n = typeof value === "number" ? value : Number(value);
                return [fmtMoney(n), ""];
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
        <span>{data[0].label}</span>
        <span>{data[data.length - 1].label}</span>
      </div>
    </div>
  );
}
