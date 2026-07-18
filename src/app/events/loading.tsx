import { AppHeader } from "@/components/app-header";
import { SkeletonPanel } from "@/components/skeleton";

export default function EventLoading() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-[560px] p-4">
        <SkeletonPanel label="Event" rows={4} />
      </main>
    </>
  );
}
