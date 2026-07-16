import { AppHeader } from "@/components/app-header";
import { SkeletonRows } from "@/components/skeleton";

export default function CalendarLoading() {
  return (
    <>
      <AppHeader active="calendar" />
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
    </>
  );
}
