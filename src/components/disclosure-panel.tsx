"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Panel } from "@/components/panel";

/**
 * Progressive-disclosure primitives for list panels: filters and add-forms
 * collapse behind quiet header toggles so the LIST is the default view. No
 * new tokens or colours — reuses the design system's existing classes.
 *
 * Collapse animates height via a grid-rows trick; it keeps content mounted
 * (so an in-flight add stays intact and autofocus can refocus on reopen) but
 * marks it inert + aria-hidden when closed. prefers-reduced-motion disables
 * the transition (instant).
 */
export function Collapse({
  open,
  autoFocus,
  children,
}: {
  open: boolean;
  autoFocus?: boolean;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const inner = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && autoFocus) {
      inner.current?.querySelector<HTMLElement>("input, textarea, select")?.focus();
    }
  }, [open, autoFocus]);

  return (
    <div
      className="grid"
      style={{
        gridTemplateRows: open ? "1fr" : "0fr",
        transition: reduce ? undefined : "grid-template-rows 180ms ease",
      }}
    >
      <div ref={inner} inert={!open} aria-hidden={!open} className="min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

/** Flat funnel glyph, matching the header's 16px icon style. */
const FunnelIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinejoin="miter"
    aria-hidden="true"
  >
    <path d="M2 3.5 H14 L9.5 8.5 V13 L6.5 11.5 V8.5 Z" />
  </svg>
);

function FilterButton({
  active,
  open,
  onClick,
}: {
  active: boolean;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="Filters"
      aria-expanded={open}
      onClick={onClick}
      className={`relative -m-1 flex cursor-pointer items-center border-0 bg-transparent p-1 ${
        open || active ? "text-ink" : "text-faint"
      }`}
    >
      <FunnelIcon />
      {active && <span className="absolute right-0 top-0 h-[5px] w-[5px] bg-ink" aria-hidden="true" />}
    </button>
  );
}

export function AddButton({
  open,
  label,
  onClick,
}: {
  open: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={open}
      onClick={onClick}
      className={`-m-1 flex h-[22px] w-[22px] cursor-pointer items-center justify-center border-0 bg-transparent p-0 font-mono text-[17px] leading-none ${
        open ? "text-ink" : "text-faint"
      }`}
    >
      {open ? "×" : "+"}
    </button>
  );
}

/**
 * A Panel whose optional filters and add-form live behind quiet header
 * toggles. `filters` collapse under the header; `form` (a render-prop given a
 * `close` callback so it can collapse itself after submit) collapses in the
 * footer with its first field autofocused on open (keeps ≤10s capture, G3).
 * The list rows are always the default view.
 */
export function DisclosurePanel({
  label,
  value,
  children,
  footer,
  filters,
  filterActive,
  addLabel,
  form,
}: {
  label: string;
  value?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  filters?: ReactNode;
  filterActive?: boolean;
  addLabel?: string;
  form?: (close: () => void) => ReactNode;
}) {
  const [showFilters, setShowFilters] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const actions =
    filters != null || form != null ? (
      <div className="flex items-center gap-1.5">
        {filters != null && (
          <FilterButton
            active={filterActive === true}
            open={showFilters}
            onClick={() => setShowFilters((v) => !v)}
          />
        )}
        {form != null && (
          <AddButton
            open={showAdd}
            label={addLabel ?? "Add"}
            onClick={() => setShowAdd((v) => !v)}
          />
        )}
      </div>
    ) : undefined;

  return (
    <Panel
      label={label}
      value={value}
      actions={actions}
      footer={
        <>
          {form != null && (
            <Collapse open={showAdd} autoFocus>
              {form(() => setShowAdd(false))}
            </Collapse>
          )}
          {footer}
        </>
      }
    >
      {filters != null && <Collapse open={showFilters}>{filters}</Collapse>}
      {children}
    </Panel>
  );
}
