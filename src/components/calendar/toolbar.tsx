import Link from "next/link";
import {
  rangeLabel,
  stepDate,
  type CalendarView,
} from "@/lib/calendar";
import { todayISO } from "@/lib/dates";
import { DOMAIN_DOT_CLASS, DOMAINS } from "@/lib/domains";

const VIEWS: CalendarView[] = ["month", "week", "day"];

const btnBase =
  "whitespace-nowrap px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[.06em] no-underline";
const btnIdle = `${btnBase} border border-border-input bg-subtle text-ink`;
const btnActive = `${btnBase} border border-ink bg-ink text-[#ffffff]`;

const href = (view: CalendarView, date: string) =>
  `/calendar?view=${view}&date=${date}`;

export function CalendarToolbar({
  view,
  date,
}: {
  view: CalendarView;
  date: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faint">
          {rangeLabel(view, date)}
        </span>
        <div className="flex-1" />
        <div className="flex gap-1">
          <Link href={href(view, stepDate(view, date, -1))} aria-label="Previous" className={btnIdle}>
            ‹
          </Link>
          <Link href={href(view, todayISO())} className={btnIdle}>
            Today
          </Link>
          <Link href={href(view, stepDate(view, date, 1))} aria-label="Next" className={btnIdle}>
            ›
          </Link>
        </div>
        <div className="flex gap-1">
          {VIEWS.map((v) => (
            <Link key={v} href={href(v, date)} className={v === view ? btnActive : btnIdle}>
              {v}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {DOMAINS.map((d) => (
          <span
            key={d}
            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase text-muted"
          >
            <span className={`h-[7px] w-[7px] ${DOMAIN_DOT_CLASS[d]}`} />
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}
