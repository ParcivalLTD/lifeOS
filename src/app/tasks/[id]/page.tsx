import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveTaskAction, updateTaskAction } from "@/app/tasks/actions";
import { AppHeader } from "@/components/app-header";
import { ConfirmButton } from "@/components/confirm-button";
import { Panel } from "@/components/panel";
import { requireUser } from "@/lib/auth";
import { getTask } from "@/lib/data/tasks";
import { DOMAINS } from "@/lib/domains";
import { recurrenceLabel } from "@/lib/recurrence";

export const metadata: Metadata = { title: "LIFEOS — TASK" };

const inputCls = "border border-border-input bg-subtle px-2.5 py-2 text-[12.5px]";
const labelCls =
  "font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faint";

export default async function TaskEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const task = await getTask(user.id, id);
  if (!task) notFound();

  const currentRepeat = recurrenceLabel(task.recurrence);

  return (
    <>
      <AppHeader active="tasks" />
      <main className="mx-auto w-full max-w-[560px] p-4">
        <Panel label="Task — edit" value={`P${task.priority}`}>
          <form action={updateTaskAction} className="flex flex-col gap-3 p-4">
            <input type="hidden" name="id" value={task.id} />

            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Title</span>
              <input name="title" required defaultValue={task.title} className={inputCls} />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Notes</span>
              <textarea
                name="notes"
                rows={3}
                defaultValue={task.notes ?? ""}
                placeholder="Optional context…"
                className={`${inputCls} resize-y`}
              />
            </label>

            <div className="flex flex-wrap gap-1.5">
              <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className={labelCls}>Domain</span>
                <select name="domain" defaultValue={task.domain} className={inputCls}>
                  {DOMAINS.map((d) => (
                    <option key={d} value={d}>
                      {d.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelCls}>Priority</span>
                <select name="priority" defaultValue={String(task.priority)} className={inputCls}>
                  <option value="1">P1</option>
                  <option value="2">P2</option>
                  <option value="3">P3</option>
                </select>
              </label>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <label className="flex flex-col gap-1.5">
                <span className={labelCls}>Due</span>
                <input
                  type="date"
                  name="due"
                  defaultValue={task.dueDate ?? ""}
                  className={`${inputCls} font-mono`}
                />
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className={labelCls}>Repeat</span>
                <select name="repeat" defaultValue="__keep" className={inputCls}>
                  <option value="__keep">KEEP ({currentRepeat ?? "NO REPEAT"})</option>
                  <option value="">NO REPEAT</option>
                  <option value="daily">DAILY</option>
                  <option value="weekly">WEEKLY</option>
                  <option value="monthly">MONTHLY</option>
                  <option value="yearly">YEARLY</option>
                </select>
              </label>
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
                formAction={archiveTaskAction}
              />
              <Link
                href="/tasks"
                className="px-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint"
              >
                Cancel
              </Link>
            </div>
            <p className="font-mono text-[9px] uppercase tracking-[.06em] text-faintest">
              Delete archives the task — it leaves all lists but stays in the
              database for reviews.
            </p>
          </form>
        </Panel>
      </main>
    </>
  );
}
