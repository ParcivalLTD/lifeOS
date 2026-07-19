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
  { key: "academic", href: "/academic", label: "ACADEMIC" },
  { key: "work", href: "/work", label: "WORK" },
  { key: "gym", href: "/gym", label: "GYM" },
  { key: "finance", href: "/finance", label: "FINANCE" },
  { key: "review", href: "/review", label: "REVIEW" },
  { key: "assistant", href: "/assistant", label: "ASSISTANT" },
  { key: "settings", href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export type TabKey = (typeof TABS)[number]["key"];

// detail routes light up their owning tab (events live on the calendar)
const PREFIXES: [string, TabKey][] = [
  ["/goals", "goals"],
  ["/tasks", "tasks"],
  ["/habits", "habits"],
  ["/calendar", "calendar"],
  ["/events", "calendar"],
  ["/academic", "academic"],
  ["/work", "work"],
  ["/gym", "gym"],
  ["/finance", "finance"],
  ["/review", "review"],
  ["/assistant", "assistant"],
  ["/settings", "settings"],
];

const activeFor = (path: string): TabKey | null => {
  if (path === "/") return "today";
  for (const [prefix, key] of PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return key;
  }
  return null;
};

/**
 * Pathname-driven nav: history.pushState from the tab shell updates
 * usePathname without a route render, so the underline follows swipes for
 * free. Tapping a track tab is offered to the shell first (custom event);
 * only when nothing claims it (settings, or a page without the shell) does
 * the Link navigate for real.
 */
export function NavTabs() {
  const active = activeFor(usePathname());

  const onClick = (e: React.MouseEvent, key: TabKey) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const handled = !window.dispatchEvent(
      new CustomEvent("lifeos:tab-nav", { detail: { key }, cancelable: true }),
    );
    if (handled) e.preventDefault();
  };

  return (
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
            className={`whitespace-nowrap border-b-2 px-1.5 py-2 font-mono text-[10px] font-semibold uppercase tracking-[.05em] no-underline sm:px-3 sm:text-[11px] sm:tracking-[.08em] ${activeCls}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
