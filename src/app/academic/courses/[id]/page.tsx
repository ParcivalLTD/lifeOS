import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  archiveAssessmentAction,
  archiveCourseAction,
  updateCourseAction,
} from "@/app/academic/actions";
import { AppHeader } from "@/components/app-header";
import { ConfirmButton } from "@/components/confirm-button";
import { Panel } from "@/components/panel";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { getCourse, listAssessments } from "@/lib/data/academic";
import { goalOptions } from "@/lib/data/goals";
import { parseISODate } from "@/lib/dates";
import { HORIZON_LABEL } from "@/lib/goals";

export const metadata: Metadata = { title: "HELM — COURSE" };

const inputCls = "border border-border-input bg-subtle px-2.5 py-2 text-[12.5px]";
const labelCls = "font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faint";
const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const dueLabel = (iso: string) => {
  const d = parseISODate(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`;
};

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [course, assessments, options] = await Promise.all([
    getCourse(user.id, id),
    listAssessments(user.id),
    goalOptions(user.id),
  ]);
  if (!course) notFound();

  const rows = assessments.filter((a) => a.courseId === id);
  const academicGoals = options.filter((g) => g.domain === "academic");

  return (
    <>
      <AppHeader />
      <main className="mx-auto flex w-full max-w-[560px] flex-col gap-3 p-4">
        <Panel label="Course — edit" value={course.code}>
          <form action={updateCourseAction} className="flex flex-col gap-3 p-4">
            <input type="hidden" name="id" value={course.id} />
            <div className="flex gap-2">
              <label className="flex w-[120px] flex-col gap-1.5">
                <span className={labelCls}>Code</span>
                <input name="code" required defaultValue={course.code} className={`${inputCls} font-mono uppercase`} />
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className={labelCls}>Name</span>
                <input name="name" required defaultValue={course.name} className={inputCls} />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="flex w-[110px] flex-col gap-1.5">
                <span className={labelCls}>Semester</span>
                <input name="semester" defaultValue={course.semester ?? ""} placeholder="S2 2026" className={`${inputCls} font-mono`} />
              </label>
              <label className="flex w-[92px] flex-col gap-1.5">
                <span className={labelCls}>Target %</span>
                <input name="targetGrade" inputMode="decimal" defaultValue={course.targetGrade ?? ""} className={`${inputCls} text-right font-mono`} />
              </label>
              <label className="flex w-[92px] flex-col gap-1.5">
                <span className={labelCls}>Study h/wk</span>
                <input name="plannedHours" inputMode="decimal" defaultValue={course.plannedHours ?? ""} className={`${inputCls} text-right font-mono`} />
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Course goal (nesting lives in the goal engine)</span>
              <select name="goalId" defaultValue={course.goalId ?? ""} className={inputCls}>
                <option value="">— no linked goal —</option>
                {academicGoals.map((g) => (
                  <option key={g.id} value={g.id}>
                    [{HORIZON_LABEL[g.horizon]}] {g.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center justify-between gap-3">
              <SubmitButton>Save</SubmitButton>
              <Link href="/academic" className="font-mono text-[10px] uppercase tracking-[.06em] text-faint">
                Cancel
              </Link>
            </div>
          </form>
        </Panel>

        <Panel label="Assessments" value={`${rows.length}`}>
          {rows.length === 0 && (
            <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
              None yet — add them from the Academic page
            </p>
          )}
          {rows.map((a) => (
            <div key={a.id} className="flex items-baseline gap-2.5 border-b border-border-row px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{a.name}</span>
              <span className="font-mono text-[11px] text-muted">{a.weight != null ? `${a.weight}%` : "—"}</span>
              <span className="font-mono text-[10px] text-faint">{dueLabel(a.dueISO)}</span>
              <span className="w-[34px] text-right font-mono text-[11px] font-semibold">{a.grade ?? "—"}</span>
              <form>
                <input type="hidden" name="id" value={a.id} />
                <ConfirmButton label="Del" confirmLabel="Sure?" formAction={archiveAssessmentAction} />
              </form>
            </div>
          ))}
        </Panel>

        <Panel label="Danger zone">
          <form className="flex flex-wrap items-center justify-between gap-3 p-3">
            <input type="hidden" name="id" value={course.id} />
            <span className="min-w-0 flex-1 font-mono text-[10px] uppercase tracking-[.04em] text-faint">
              Archives the course and its assessments; logged study hours are kept.
            </span>
            <ConfirmButton label="Archive course" confirmLabel="Archive — sure?" formAction={archiveCourseAction} />
          </form>
        </Panel>
      </main>
    </>
  );
}
