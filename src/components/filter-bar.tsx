"use client";

import type { ReactNode } from "react";

/**
 * Compact filter strip primitives matching the design system. Sits under a
 * panel header; wraps on mobile. Kept separate from the add form so filtering
 * never interferes with the sub-10s capture flow (G3).
 */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border-row bg-subtle px-3 py-2">
      {children}
    </div>
  );
}

const selectCls =
  "border border-border-input bg-surface px-1.5 py-1 font-mono text-[10px] uppercase tracking-[.04em]";

export function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex items-center gap-1">
      <span className="font-mono text-[9px] font-semibold uppercase tracking-[.08em] text-faint">
        {label}
      </span>
      <select
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value as T)}
        className={selectCls}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Square-check toggle (design system: squares, never switches). */
export function FilterToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className="flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 font-mono text-[10px] font-semibold uppercase tracking-[.06em]"
    >
      <span
        className={`flex h-[14px] w-[14px] items-center justify-center border-[1.5px] border-ink text-[9px] leading-none ${
          checked ? "bg-ink text-[#ffffff]" : "bg-surface"
        }`}
      >
        {checked ? "✓" : ""}
      </span>
      {label}
    </button>
  );
}
