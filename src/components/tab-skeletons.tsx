import { Panel } from "@/components/panel";
import { SkeletonChart, SkeletonPanel, SkeletonRows } from "@/components/skeleton";

/**
 * Per-tab skeleton bodies (page frame without data). Used by the co-mounted
 * TabsApp track as cache-miss fallbacks: if a neighbor's data hasn't been
 * fetched yet when a swipe starts, the finger drags this frame instead of a
 * blank — never a white flash.
 */
export function TodaySkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 p-4">
      <div className="h-[38px] bg-ink opacity-90" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-3">
        <SkeletonPanel label="Schedule" rows={5} />
        <SkeletonPanel label="Tasks" rows={3} />
        <SkeletonPanel label="Habits" rows={5} />
        <SkeletonPanel label="Goals" rows={4} />
        <SkeletonPanel label="Budget" rows={3} />
        <SkeletonPanel label="Workout" rows={2} />
      </div>
    </main>
  );
}

export function GoalsSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 p-4">
      <SkeletonPanel label="Life" rows={3} />
      <SkeletonPanel label="Yearly" rows={4} />
      <SkeletonPanel label="Quarterly" rows={3} />
    </main>
  );
}

export function TasksSkeleton() {
  return (
    <main className="mx-auto w-full max-w-[720px] p-4">
      <SkeletonPanel label="Tasks" rows={6} />
    </main>
  );
}

export function HabitsSkeleton() {
  return (
    <main className="mx-auto w-full max-w-[720px] p-4">
      <SkeletonPanel label="Habits" rows={6} />
    </main>
  );
}

export function CalendarSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 p-4">
      <div className="h-7 w-56 bg-track" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] items-stretch gap-2">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="min-h-[190px] border border-border-outer bg-surface">
            <div className="border-b border-border-header bg-subtle px-2 py-1.5">
              <div className="h-2.5 w-10 bg-track" />
            </div>
            <SkeletonRows rows={2} />
          </div>
        ))}
      </div>
    </main>
  );
}

export function AcademicSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 p-4">
      <div className="h-4 w-64 bg-track" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-3">
        <SkeletonPanel label="Course" rows={4} />
        <SkeletonPanel label="Course" rows={4} />
        <div className="flex flex-col gap-3">
          <SkeletonPanel label="Study hours — this week" rows={3} />
          <SkeletonPanel label="Goals" rows={3} />
        </div>
      </div>
    </main>
  );
}

export function WorkSkeleton() {
  return (
    <main className="mx-auto grid w-full max-w-[1280px] grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-3 p-4">
      <SkeletonPanel label="Projects" rows={4} />
      <SkeletonPanel label="Achievements log" rows={4} />
      <SkeletonPanel label="Career goals" rows={3} />
    </main>
  );
}

export function GymSkeleton() {
  return (
    <main className="mx-auto grid w-full max-w-[1280px] grid-cols-[repeat(auto-fit,minmax(330px,1fr))] items-start gap-3 p-4">
      <SkeletonPanel label="Session" rows={6} />
      <div className="flex flex-col gap-3">
        <SkeletonPanel label="Estimated 1RM — PRs" rows={4} />
        <Panel label="e1RM — last 8 weeks">
          <SkeletonChart />
        </Panel>
        <SkeletonPanel label="Adherence — this week" rows={1} />
        <SkeletonPanel label="Templates" rows={2} />
      </div>
    </main>
  );
}

export function FinanceSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 p-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-start gap-3">
        <Panel label="Net worth">
          <SkeletonChart />
        </Panel>
        <SkeletonPanel label="Accounts" rows={4} />
        <SkeletonPanel label="Savings goals" rows={2} />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-3">
        <SkeletonPanel label="Budget vs actual" rows={5} />
        <SkeletonPanel label="Expense log" rows={6} />
        <SkeletonPanel label="Bills & subscriptions" rows={4} />
      </div>
    </main>
  );
}

export function SettingsSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-3 p-4">
      <SkeletonPanel label="Account" rows={1} />
      <SkeletonPanel label="Data & backup" rows={3} />
      <SkeletonPanel label="Recent backups" rows={3} />
    </main>
  );
}
