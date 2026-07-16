import { AppHeader } from "@/components/app-header";
import { SkeletonPanel } from "@/components/skeleton";

export default function TasksLoading() {
  return (
    <>
      <AppHeader active="tasks" />
      <main className="mx-auto w-full max-w-[720px] p-4">
        <SkeletonPanel label="Tasks" rows={6} />
      </main>
    </>
  );
}
