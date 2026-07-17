import type { Metadata } from "next";
import { GymContent } from "@/app/gym/content";
import { AppHeader } from "@/components/app-header";
import { TabShell } from "@/components/tab-shell";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "LIFEOS — GYM" };

export default async function GymPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; lift?: string }>;
}) {
  const user = await requireUser();
  const { session, lift } = await searchParams;
  return (
    <>
      <AppHeader active="gym" />
      <TabShell active="gym" userId={user.id} email={user.email ?? ""}>
        <GymContent userId={user.id} sessionId={session} lift={lift} />
      </TabShell>
    </>
  );
}
