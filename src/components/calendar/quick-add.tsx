import { createEventAction } from "@/app/events/actions";
import { SubmitButton } from "@/components/submit-button";
import { DOMAINS } from "@/lib/domains";
import { EVENT_KINDS, KIND_LABEL } from "@/lib/event-utils";

const inputCls = "border border-border-input bg-subtle px-2.5 py-2 text-[12.5px]";
const selectCls = "border border-border-input bg-subtle px-1.5 py-2 text-[12px]";

/**
 * Sub-10-second capture: type a title and hit ADD — all-day event on the
 * anchored date, kind/domain optional. A time makes it a timed event.
 * Plain form + server action, no client JS.
 */
export function QuickAddEvent({ defaultDate }: { defaultDate: string }) {
  return (
    <form
      action={createEventAction}
      className="flex flex-wrap items-stretch gap-1.5 border border-border-outer bg-surface p-3"
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
  );
}
