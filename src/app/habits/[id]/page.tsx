import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveHabitAction, updateHabitAction } from "@/app/habits/actions";
import { AppHeader } from "@/components/app-header";
import { ConfirmButton } from "@/components/confirm-button";
import { HabitScheduleFields } from "@/components/habit-schedule-fields";
import { Panel } from "@/components/panel";
import { requireUser } from "@/lib/auth";
import { getHabit } from "@/lib/data/habits";
import { DOMAINS } from "@/lib/domains";
import { scheduleLabel } from "@/lib/habits";

export const metadata: Metadata = { title: "HELM — HABIT" };

const inputCls = "border border-border-input bg-subtle px-2.5 py-2 text-[12.5px]";
const labelCls =
  "font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faint";

export default async function HabitEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const habit = await getHabit(user.id, id);
  if (!habit) notFound();

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-[560px] p-4">
        <Panel label="Habit — edit" value={scheduleLabel(habit.schedule)}>
          <form action={updateHabitAction} className="flex flex-col gap-3 p-4">
            <input type="hidden" name="id" value={habit.id} />

            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Title</span>
              <input name="title" required defaultValue={habit.title} className={inputCls} />
            </label>

            <label className="flex min-w-0 flex-col gap-1.5">
              <span className={labelCls}>Domain</span>
              <select name="domain" defaultValue={habit.domain} className={inputCls}>
                {DOMAINS.map((d) => (
                  <option key={d} value={d}>
                    {d.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-col gap-1.5">
              <span className={labelCls}>Schedule</span>
              <div className="flex flex-wrap items-stretch gap-1.5">
                <HabitScheduleFields
                  keepLabel={scheduleLabel(habit.schedule)}
                  defaultDays={
                    habit.schedule.type === "weekly_days" ? habit.schedule.days : []
                  }
                  defaultTimes={
                    habit.schedule.type === "times_per_week" ? habit.schedule.times : 3
                  }
                />
              </div>
              <p className="font-mono text-[9px] uppercase tracking-[.06em] text-faintest">
                Schedule changes apply from today. Past completions and past
                adherence keep the old schedule; the streak restarts under the
                new one. The completion log itself is never modified.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="submit"
                className="cursor-pointer border-0 bg-ink px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#ffffff]"
              >
                Save
              </button>
              <ConfirmButton
                label="Delete"
                confirmLabel="Confirm delete?"
                formAction={archiveHabitAction}
              />
              <Link
                href="/habits"
                className="px-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint"
              >
                Cancel
              </Link>
            </div>
            <p className="font-mono text-[9px] uppercase tracking-[.06em] text-faintest">
              Delete archives the habit — its completion history is kept for
              reviews and returns intact if the habit is restored.
            </p>
          </form>
        </Panel>
      </main>
    </>
  );
}
