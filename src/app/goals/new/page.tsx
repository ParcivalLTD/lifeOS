import type { Metadata } from "next";
import { createGoalAction } from "@/app/goals/actions";
import { AppHeader } from "@/components/app-header";
import { GoalForm } from "@/components/goals/goal-form";
import { requireUser } from "@/lib/auth";
import { goalOptions } from "@/lib/data/goals";

export const metadata: Metadata = { title: "LIFEOS — NEW GOAL" };

export default async function NewGoalPage({
  searchParams,
}: {
  searchParams: Promise<{ parent?: string }>;
}) {
  const user = await requireUser();
  const { parent } = await searchParams;
  const parents = await goalOptions(user.id);

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-[560px] p-4">
        <GoalForm action={createGoalAction} parentOptions={parents} defaultParentId={parent} />
      </main>
    </>
  );
}
