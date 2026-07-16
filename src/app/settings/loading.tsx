import { AppHeader } from "@/components/app-header";
import { SkeletonPanel } from "@/components/skeleton";

export default function SettingsLoading() {
  return (
    <>
      <AppHeader active="settings" />
      <main className="mx-auto w-full max-w-[720px] p-4">
        <SkeletonPanel label="Settings" rows={4} />
      </main>
    </>
  );
}
