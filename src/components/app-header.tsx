import Link from "next/link";
import { SwipeNav } from "@/components/swipe-nav";
import { headerDate } from "@/lib/dates";

/** Flat 16px house glyph — squared joins per the design system. */
const HomeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="miter" aria-hidden="true">
    <path d="M1.5 8.5 L8 2 L14.5 8.5" />
    <path d="M3.5 7.5 V14 H12.5 V7.5" />
  </svg>
);

/** Flat sliders glyph (rectangular knobs — squares, never circles). */
const SettingsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="miter" aria-hidden="true">
    <path d="M1.5 4.5 H14.5" />
    <rect x="9.5" y="2.75" width="3.5" height="3.5" fill="var(--color-surface)" />
    <path d="M1.5 11.5 H14.5" />
    <rect x="3" y="9.75" width="3.5" height="3.5" fill="var(--color-surface)" />
  </svg>
);

const TABS = [
  { key: "today", href: "/", label: "Today", icon: HomeIcon },
  { key: "goals", href: "/goals", label: "GOALS" },
  { key: "tasks", href: "/tasks", label: "TASKS" },
  { key: "habits", href: "/habits", label: "HABITS" },
  { key: "calendar", href: "/calendar", label: "CALENDAR" },
  { key: "gym", href: "/gym", label: "GYM" },
  { key: "finance", href: "/finance", label: "FINANCE" },
  { key: "settings", href: "/settings", label: "Settings", icon: SettingsIcon },
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
      <nav className="mx-auto -mb-px flex max-w-[1280px] items-stretch overflow-x-auto px-1 sm:px-2">
        {TABS.map((t) => {
          const activeCls =
            active === t.key ? "border-ink text-ink" : "border-transparent text-faint";
          if ("icon" in t) {
            const Icon = t.icon;
            return (
              <Link
                key={t.key}
                href={t.href}
                aria-label={t.label}
                className={`flex items-center border-b-2 px-1.5 py-2 no-underline sm:px-3 ${activeCls}`}
              >
                <Icon />
              </Link>
            );
          }
          return (
            <Link
              key={t.key}
              href={t.href}
              className={`whitespace-nowrap border-b-2 px-1.5 py-2 font-mono text-[10px] font-semibold uppercase tracking-[.05em] no-underline sm:px-3 sm:text-[11px] sm:tracking-[.08em] ${activeCls}`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <SwipeNav />
    </header>
  );
}
