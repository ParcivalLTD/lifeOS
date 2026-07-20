import { NavTabs, type TabKey } from "@/components/nav-tabs";
import { headerDate } from "@/lib/dates";

export type { TabKey };

export function AppHeader() {
  return (
    <header className="border-b border-border-outer bg-surface">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-baseline gap-x-4 gap-y-1 px-4 pt-2.5 pb-2">
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-[15px] font-bold tracking-[.05em]">
            HELM
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
      <NavTabs />
    </header>
  );
}
