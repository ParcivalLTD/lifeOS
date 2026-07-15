import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Panel } from "@/components/panel";
import { requireUser } from "@/lib/auth";

export default async function Home() {
  await requireUser();

  return (
    <>
      <AppHeader active="today" />
      <main className="mx-auto w-full max-w-[720px] p-4">
        <Panel label="Today" value="Phase 1 — Spine">
          <div className="flex flex-col gap-2 px-3 py-3">
            <p className="text-[12.5px]">
              The Today dashboard ships at the end of Phase 1. Live now:{" "}
              <Link href="/tasks">Tasks</Link> and <Link href="/habits">Habits</Link>.
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[.06em] text-faint">
              Capture target: any log in under 10 seconds
            </p>
          </div>
        </Panel>
      </main>
    </>
  );
}
