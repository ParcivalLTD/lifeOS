import Link from "next/link";
import { headerDate } from "@/lib/dates";

const TABS = [
  { key: "today", href: "/", label: "TODAY" },
  { key: "tasks", href: "/tasks", label: "TASKS" },
  { key: "habits", href: "/habits", label: "HABITS" },
  { key: "calendar", href: "/calendar", label: "CALENDAR" },
] as const;

export type TabKey = (typeof TABS)[number]["key"];

export function AppHeader({ active }: { active: TabKey }) {
  return (
    <header className="border-b border-border-outer bg-surface">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-baseline gap-x-4 gap-y-1 px-4 pt-2.5 pb-2">
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-[15px] font-bold tracking-[.05em]">
            LIFEOS
          </span>
          <span className="border border-border-outer px-[5px] py-px font-mono text-[9px] font-semibold tracking-[.06em] text-faint">
            V0.1
          </span>
        </span>
        <div className="flex-1" />
        <span className="font-mono text-[11px] font-semibold tracking-[.06em]">
          {headerDate()}
        </span>
        <form method="post" action="/auth/logout">
          <button
            type="submit"
            className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[10px] uppercase tracking-[.06em] text-faint underline underline-offset-2"
          >
            Sign out
          </button>
        </form>
      </div>
      <nav className="mx-auto -mb-px flex max-w-[1280px] overflow-x-auto px-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={`whitespace-nowrap border-b-2 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.08em] no-underline ${
              active === t.key
                ? "border-ink text-ink"
                : "border-transparent text-faint"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
