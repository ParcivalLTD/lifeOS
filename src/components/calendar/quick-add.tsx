"use client";

import { useRef, useState } from "react";
import { createEventAction } from "@/app/events/actions";
import { AddButton, Collapse } from "@/components/disclosure-panel";
import { SubmitButton } from "@/components/submit-button";
import { DOMAINS } from "@/lib/domains";
import { EVENT_KINDS, KIND_LABEL } from "@/lib/event-utils";

const inputCls = "border border-border-input bg-subtle px-2.5 py-2 text-[12.5px]";
const selectCls = "border border-border-input bg-subtle px-1.5 py-2 text-[12px]";

/**
 * Sub-10-second capture: type a title and hit ADD — all-day event on the
 * anchored date, kind/domain optional. A time makes it a timed event.
 * Collapsed behind a “+” button; collapses after a successful add.
 */
export function QuickAddEvent({ defaultDate }: { defaultDate: string }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="border border-border-outer bg-surface">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faint">
          Add event
        </span>
        <AddButton open={open} label="Add event" onClick={() => setOpen((v) => !v)} />
      </div>
      <Collapse open={open} autoFocus>
        <form
          ref={formRef}
          action={async (fd) => {
            await createEventAction(fd);
            formRef.current?.reset();
            setOpen(false);
          }}
          className="flex flex-wrap items-stretch gap-1.5 border-t border-border-header p-3"
        >
          <input
            name="title"
            required
            placeholder="Add an event…"
            aria-label="Event title"
            autoComplete="off"
            className={`${inputCls} min-w-0 flex-[2_1_180px]`}
          />
          <input
            type="date"
            name="date"
            defaultValue={defaultDate}
            aria-label="Date"
            className={`${selectCls} flex-[1_0_130px] font-mono`}
          />
          <input
            type="time"
            name="time"
            aria-label="Start time (empty = all-day)"
            className={`${selectCls} font-mono`}
          />
          <input
            type="time"
            name="end"
            aria-label="End time"
            className={`${selectCls} hidden font-mono sm:block`}
          />
          <select name="kind" defaultValue="appointment" aria-label="Kind" className={selectCls}>
            {EVENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <select name="domain" defaultValue="personal" aria-label="Domain" className={`${selectCls} flex-[1_0_98px]`}>
            {DOMAINS.map((d) => (
              <option key={d} value={d}>
                {d.toUpperCase()}
              </option>
            ))}
          </select>
          <SubmitButton>Add</SubmitButton>
        </form>
      </Collapse>
    </div>
  );
}
