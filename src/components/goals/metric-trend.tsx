import { DOMAIN_DOT_CLASS } from "@/lib/domains";
import type { Domain } from "@/lib/domains";

/** Tiny flat bar strip for a metric's recent datapoints (server-rendered). */
export function MetricTrend({
  points,
  domain,
}: {
  points: { dateISO: string; value: number }[];
  domain: Domain;
}) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.abs(max) || 1;
  return (
    <div className="flex h-8 items-end gap-[3px]">
      {points.map((p, i) => (
        <div
          key={i}
          className={`flex-1 ${i === points.length - 1 ? DOMAIN_DOT_CLASS[domain] : "bg-bar-inactive"}`}
          style={{ height: `${20 + 80 * ((p.value - min) / span)}%` }}
          title={`${p.dateISO}: ${p.value}`}
        />
      ))}
    </div>
  );
}
