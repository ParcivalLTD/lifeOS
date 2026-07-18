import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveProjectAction, updateProjectAction } from "@/app/work/actions";
import { AppHeader } from "@/components/app-header";
import { ConfirmButton } from "@/components/confirm-button";
import { Panel } from "@/components/panel";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { goalOptions } from "@/lib/data/goals";
import { getProject } from "@/lib/data/work";
import { HORIZON_LABEL } from "@/lib/goals";

export const metadata: Metadata = { title: "LIFEOS — PROJECT" };

const inputCls = "border border-border-input bg-subtle px-2.5 py-2 text-[12.5px]";
const labelCls = "font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faint";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [project, options] = await Promise.all([getProject(user.id, id), goalOptions(user.id)]);
  if (!project) notFound();

  return (
    <>
      <AppHeader />
      <main className="mx-auto flex w-full max-w-[560px] flex-col gap-3 p-4">
        <Panel label="Project — edit">
          <form action={updateProjectAction} className="flex flex-col gap-3 p-4">
            <input type="hidden" name="id" value={project.id} />
            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Name</span>
              <input name="title" required defaultValue={project.title} className={inputCls} />
            </label>
            <label className="flex w-[160px] flex-col gap-1.5">
              <span className={labelCls}>Deadline</span>
              <input type="date" name="due" required defaultValue={project.dueISO} className={`${inputCls} font-mono`} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>
                Project goal — next actions are Tasks on this goal
              </span>
              <select name="goalId" defaultValue={project.goalId ?? ""} className={inputCls}>
                <option value="">— no linked goal —</option>
                {options.map((g) => (
                  <option key={g.id} value={g.id}>
                    [{HORIZON_LABEL[g.horizon]} · {g.domain.toUpperCase()}] {g.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center justify-between gap-3">
              <SubmitButton>Save</SubmitButton>
              <Link href="/work" className="font-mono text-[10px] uppercase tracking-[.06em] text-faint">
                Cancel
              </Link>
            </div>
          </form>
        </Panel>

        <Panel label="Danger zone">
          <form className="flex flex-wrap items-center justify-between gap-3 p-3">
            <input type="hidden" name="id" value={project.id} />
            <span className="min-w-0 flex-1 font-mono text-[10px] uppercase tracking-[.04em] text-faint">
              Archives the project; tracked hours and linked tasks are kept.
            </span>
            <ConfirmButton label="Archive project" confirmLabel="Archive — sure?" formAction={archiveProjectAction} />
          </form>
        </Panel>
      </main>
    </>
  );
}
