import { Panel } from "@/components/panel";

/**
 * Design-token skeletons for route loading states: real panel chrome with
 * ghost track bars where rows will land — structure without fake data. Flat,
 * no animation (the design has no motion language).
 */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  const widths = [78, 62, 70, 54, 66, 74, 58];
  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="h-2.5 bg-track" style={{ width: `${widths[i % widths.length]}%` }} />
          <div className="h-1.5 bg-track" style={{ width: `${widths[(i + 3) % widths.length] - 30}%` }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonPanel({ label, rows = 4 }: { label: string; rows?: number }) {
  return (
    <Panel label={label}>
      <SkeletonRows rows={rows} />
    </Panel>
  );
}

/** Ghost bar-chart block (net worth / e1RM chart placeholders). */
export function SkeletonChart() {
  const heights = [40, 55, 48, 62, 70, 66, 82, 100];
  return (
    <div className="flex h-[64px] items-end gap-1 px-3 pt-3 pb-3">
      {heights.map((h, i) => (
        <div key={i} className="flex-1 bg-track" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}
