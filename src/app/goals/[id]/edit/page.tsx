import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { updateGoalAction } from "@/app/goals/actions";
import { AppHeader } from "@/components/app-header";
import { GoalForm } from "@/components/goals/goal-form";
import { requireUser } from "@/lib/auth";
import { getGoal, goalOptions } from "@/lib/data/goals";

export const metadata: Metadata = { title: "LIFEOS — EDIT GOAL" };

export default async function EditGoalPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [goal, parents] = await Promise.all([getGoal(user.id, id), goalOptions(user.id)]);
  if (!goal) notFound();

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-[560px] p-4">
        <GoalForm
          action={updateGoalAction}
          parentOptions={parents}
          values={{
            id: goal.id,
            title: goal.title,
            description: goal.description,
            domain: goal.domain,
            horizon: goal.horizon,
            parentGoalId: goal.parentGoalId,
            targetDate: goal.targetDate,
            successCriteria: goal.successCriteria,
            status: goal.status,
          }}
        />
      </main>
    </>
  );
}
