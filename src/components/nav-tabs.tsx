"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Flat 16px house glyph — squared joins per the design system. */
const HomeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="miter" aria-hidden="true">
    <path d="M1.5 8.5 L8 2 L14.5 8.5" />
    <path d="M3.5 7.5 V14 H12.5 V7.5" />
  </svg>
);

/** Flat gear glyph — square teeth, square hub (never circles). */
const GearIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="miter" aria-hidden="true">
    <path d="M6.4 1.8 H9.6 L10 3.6 L11.6 4.3 L13.2 3.4 L14.8 6.2 L13.4 7.3 V8.7 L14.8 9.8 L13.2 12.6 L11.6 11.7 L10 12.4 L9.6 14.2 H6.4 L6 12.4 L4.4 11.7 L2.8 12.6 L1.2 9.8 L2.6 8.7 V7.3 L1.2 6.2 L2.8 3.4 L4.4 4.3 L6 3.6 Z" />
    <rect x="6.2" y="6.2" width="3.6" height="3.6" />
  </svg>
);

/**
 * The primary nav: Home icon + six tabs. Several merge a pair of views
 * behind a segmented control on the page itself (Daily = Tasks|Habits,
 * Acad & Work = Academic|Work, Gym & Health = Gym|Health; Assistant =
 * Chat|Reviews), so the row stays short enough to read on a 360px phone
 * without scrolling.
 *
 * Goals is deliberately NOT here — it stays a real route reached from the
 * dashboard's Goals card ("All goals →"). Settings moved to the header's
 * gear icon.
 */
const TABS = [
  { key: "today", href: "/", label: "Today", short: "Today", icon: HomeIcon },
  { key: "daily", href: "/tasks", label: "DAILY", short: "DAILY" },
  { key: "calendar", href: "/calendar", label: "CALENDAR", short: "CAL" },
  { key: "acadwork", href: "/academic", label: "ACADEMIC & WORK", short: "ACAD·WORK" },
  { key: "gym", href: "/gym", label: "GYM & HEALTH", short: "GYM·HLTH" },
  { key: "finance", href: "/finance", label: "FINANCE", short: "FIN" },
  { key: "assistant", href: "/assistant", label: "ASSISTANT", short: "ASSIST" },
] as const;

export type TabKey = (typeof TABS)[number]["key"] | "settings";

// detail routes light up their owning tab (events live on the calendar; a
// merged tab lights up from either of its segments' routes)
const PREFIXES: [string, TabKey][] = [
  ["/tasks", "daily"],
  ["/habits", "daily"],
  ["/calendar", "calendar"],
  ["/events", "calendar"],
  ["/academic", "acadwork"],
  ["/work", "acadwork"],
  ["/gym", "gym"],
  ["/health", "gym"],
  ["/finance", "finance"],
  ["/assistant", "assistant"],
  ["/review", "assistant"],
  ["/settings", "settings"],
];

const activeFor = (path: string): TabKey | null => {
  if (path === "/") return "today";
  for (const [prefix, key] of PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return key;
  }
  return null; // e.g. /goals — reachable, just not a top-level tab
};

/** The gear that replaced the Settings tab; lives in the header's top row. */
export function SettingsLink() {
  const active = activeFor(usePathname()) === "settings";
  return (
    <Link
      href="/settings"
      aria-label="Settings"
      className={`flex -my-1 items-center self-center p-1 no-underline ${active ? "text-ink" : "text-faint"}`}
    >
      <GearIcon />
    </Link>
  );
}

/**
 * Pathname-driven nav: history.pushState from the tab shell updates
 * usePathname without a route render, so the underline follows swipes for
 * free. Tapping a track tab is offered to the shell first (custom event);
 * only when nothing claims it (assistant, or a page without the shell) does
 * the Link navigate for real.
 */
export function NavTabs() {
  const active = activeFor(usePathname());

  const onClick = (e: React.MouseEvent, key: TabKey) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const handled = !window.dispatchEvent(
      new CustomEvent("helm:tab-nav", { detail: { key }, cancelable: true }),
    );
    if (handled) e.preventDefault();
  };

  return (
    <nav className="nav-scroll mx-auto -mb-px flex max-w-[1280px] items-stretch overflow-x-auto px-0.5 sm:px-2">
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
              onClick={(e) => onClick(e, t.key)}
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
            onClick={(e) => onClick(e, t.key)}
            className={`whitespace-nowrap border-b-2 px-1.5 py-2 font-mono text-[9px] font-semibold uppercase tracking-[.03em] no-underline sm:px-3 sm:text-[11px] sm:tracking-[.08em] ${activeCls}`}
          >
            <span className="sm:hidden">{t.short}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
