import type { ReactNode } from "react";

/** Mockup panel: white card, 1px outer border, mono uppercase header row. */
export function Panel({
  label,
  value,
  children,
  footer,
}: {
  label: string;
  value?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="border border-border-outer bg-surface">
      <div className="flex items-baseline justify-between gap-3 border-b border-border-header px-3 py-2.5">
        <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faint">
          {label}
        </h2>
        {value != null && (
          <span className="font-mono text-[11px] text-muted">{value}</span>
        )}
      </div>
      {children}
      {footer}
    </section>
  );
}
