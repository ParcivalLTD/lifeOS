import { Suspense, type ComponentType, type ReactNode } from "react";
import { TabTrack } from "@/components/tab-track";
import {
  CalendarSkeleton,
  FinanceSkeleton,
  GoalsSkeleton,
  GymSkeleton,
  HabitsSkeleton,
  SettingsSkeleton,
  TasksSkeleton,
  TodaySkeleton,
} from "@/components/tab-skeletons";
import { TodayContent } from "@/app/content";
import { GoalsContent } from "@/app/goals/content";
import { TasksContent } from "@/app/tasks/content";
import { HabitsContent } from "@/app/habits/content";
import { CalendarContent } from "@/app/calendar/content";
import { GymContent } from "@/app/gym/content";
import { FinanceContent } from "@/app/finance/content";
import { SettingsContent } from "@/app/settings/content";
import type { TabKey } from "@/components/app-header";

type NeighborProps = { userId: string; email: string };

const TABS: {
  key: TabKey;
  href: string;
  Content: ComponentType<NeighborProps>;
  Skeleton: ComponentType;
}[] = [
  { key: "today", href: "/", Content: TodayContent, Skeleton: TodaySkeleton },
  { key: "goals", href: "/goals", Content: GoalsContent, Skeleton: GoalsSkeleton },
  { key: "tasks", href: "/tasks", Content: TasksContent, Skeleton: TasksSkeleton },
  { key: "habits", href: "/habits", Content: HabitsContent, Skeleton: HabitsSkeleton },
  { key: "calendar", href: "/calendar", Content: CalendarContent, Skeleton: CalendarSkeleton },
  { key: "gym", href: "/gym", Content: GymContent, Skeleton: GymSkeleton },
  { key: "finance", href: "/finance", Content: FinanceContent, Skeleton: FinanceSkeleton },
  { key: "settings", href: "/settings", Content: SettingsContent, Skeleton: SettingsSkeleton },
];

/**
 * Server shell for the swipeable tab track: renders the active tab's content
 * (passed in by the page, with its own searchParams applied) plus its
 * immediate neighbors, each Suspense-wrapped so the page's own content
 * streams first and neighbor data settles a beat later (skeleton frame in
 * the meantime — never a blank).
 */
export function TabShell({
  active,
  userId,
  email,
  children,
}: {
  active: TabKey;
  userId: string;
  email: string;
  children: ReactNode;
}) {
  const idx = TABS.findIndex((t) => t.key === active);
  const prev = idx > 0 ? TABS[idx - 1] : null;
  const next = idx < TABS.length - 1 ? TABS[idx + 1] : null;

  const neighbor = (tab: NonNullable<typeof prev>) => {
    const C = tab.Content;
    const S = tab.Skeleton;
    return (
      <Suspense fallback={<S />}>
        <C userId={userId} email={email} />
      </Suspense>
    );
  };

  return (
    <TabTrack
      prevHref={prev?.href ?? null}
      nextHref={next?.href ?? null}
      left={prev ? neighbor(prev) : null}
      right={next ? neighbor(next) : null}
    >
      {children}
    </TabTrack>
  );
}
