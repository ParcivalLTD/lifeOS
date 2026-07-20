"use client";

import Link from "next/link";
import {
  addAssessmentAction,
  addCourseAction,
  gradeAssessmentAction,
  logStudyAction,
} from "@/app/academic/actions";
import { useState } from "react";
import { AddButton, Collapse, DisclosurePanel } from "@/components/disclosure-panel";
import { GoalProgressRow } from "@/components/goals/goal-progress-row";
import { Panel } from "@/components/panel";
import { SubmitButton } from "@/components/submit-button";
import type { PaceTone } from "@/lib/academic";
import { parseISODate } from "@/lib/dates";
import type { AcademicData } from "@/lib/tab-data";

const inputCls = "border border-border-input bg-subtle px-2.5 py-2 text-[12.5px]";
const numCls = "border border-border-input bg-subtle px-2 py-2 text-right font-mono text-[12px]";
const addBtn = "cursor-pointer border-0 bg-ink px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#ffffff] disabled:opacity-50";

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const dueLabel = (iso: string) => {
  const d = parseISODate(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};

const TONE_TEXT: Record<PaceTone, string> = {
  good: "text-status-good border-status-good",
  warn: "text-status-warn border-status-warn",
  bad: "text-status-bad border-status-bad",
  faint: "text-faint border-border-input",
};

const studyTone = (actual: number, planned: number | null): string => {
  if (planned == null || planned <= 0) return "bg-track";
  const r = actual / planned;
  return r >= 0.9 ? "bg-status-good" : r >= 0.5 ? "bg-status-warn" : "bg-status-bad";
};

/** One course card (FR-ACAD.2/4). The add-assessment form collapses behind a
 * "+" in the header so the assessment list is the default view. */
function CourseCard({
  c,
  todayISO,
}: {
  c: AcademicData["courses"][number];
  todayISO: string;
}) {
  const [showAdd, setShowAdd] = useState(false);
  return (
    <section className="border border-border-outer bg-surface">
      <div className="flex items-baseline justify-between gap-3 border-b border-border-header px-3 py-2.5">
        <Link href={`/academic/courses/${c.id}`} className="min-w-0 no-underline">
          <span className="font-mono text-[11px] font-semibold tracking-[.04em]">
            {c.code} <span className="font-normal text-muted">{c.name}</span>
          </span>
        </Link>
        <div className="flex items-center gap-2.5">
          <span
            className={`flex-none border px-[5px] py-px font-mono text-[9px] font-semibold tracking-[.07em] ${TONE_TEXT[c.pace.tone]}`}
          >
            {c.pace.label}
          </span>
          <AddButton open={showAdd} label="Add assessment" onClick={() => setShowAdd((v) => !v)} />
        </div>
      </div>

      {c.assessments.length === 0 && (
        <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
          No assessments yet — tap + to add one
        </p>
      )}
      {c.assessments.map((a) => {
        const dueUngraded = a.grade == null && a.dueISO <= todayISO;
        return (
          <div key={a.id} className="flex items-baseline gap-2.5 border-b border-border-row px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-[12.5px]">{a.name}</span>
            <span className="w-[36px] text-right font-mono text-[11px] text-muted">
              {a.weight != null ? `${a.weight}%` : "—"}
            </span>
            <span
              className={`w-[72px] text-right font-mono text-[10px] ${dueUngraded ? "text-status-bad" : "text-faint"}`}
            >
              {a.dueISO === todayISO ? "DUE TODAY" : dueLabel(a.dueISO)}
            </span>
            {/* grade capture: type + Enter (the module's fastest flow) */}
            <form action={gradeAssessmentAction} className="flex-none">
              <input type="hidden" name="id" value={a.id} />
              <input
                name="grade"
                defaultValue={a.grade ?? ""}
                placeholder="—"
                inputMode="decimal"
                aria-label={`Grade for ${a.name}`}
                className="w-[44px] border border-border-input bg-subtle px-1 py-0.5 text-right font-mono text-[11px] font-semibold"
              />
            </form>
          </div>
        );
      })}

      {/* pace basis — what the chip actually means, never a bare number */}
      <div className="border-b border-border-row px-3 py-2 font-mono text-[9px] uppercase tracking-[.04em] text-faint">
        {c.pace.basis}
        {c.currentGrade != null && ` · CURRENT ${c.currentGrade}%${c.targetGrade != null ? ` / TARGET ${c.targetGrade}%` : ""}`}
        {c.goalTitle && (
          <>
            {" · "}
            <Link href={`/goals/${c.goalId}`} className="text-faint">
              GOAL: {c.goalTitle.toUpperCase()}
            </Link>
          </>
        )}
      </div>

      <Collapse open={showAdd} autoFocus>
        <form
          action={async (fd) => {
            await addAssessmentAction(fd);
            setShowAdd(false);
          }}
          className="flex flex-wrap gap-1.5 border-t border-border-header bg-subtle p-2.5"
        >
          <input type="hidden" name="courseId" value={c.id} />
          <input name="name" required placeholder="Assessment" aria-label="Assessment name" autoComplete="off" className={`${inputCls} min-w-0 flex-[2_1_110px] py-1.5 text-[12px]`} />
          <input name="weight" inputMode="decimal" placeholder="wt%" aria-label="Weight percent" className={`${numCls} w-[52px] py-1.5`} />
          <input type="date" name="due" required defaultValue={todayISO} aria-label="Due date" className={`${inputCls} py-1.5 font-mono text-[11px]`} />
          <SubmitButton className={`${addBtn} px-2.5 py-1.5 text-[10px]`}>Add</SubmitButton>
        </form>
      </Collapse>
    </section>
  );
}

export function AcademicViewTab({ data }: { data: AcademicData }) {
  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faint">
          Academic{data.semesterLabel ? ` — ${data.semesterLabel}` : ""}
        </span>
        <span className="font-mono text-[11px] text-muted" title={data.avg.basis}>
          {data.avg.current != null
            ? `SEM AVG ${data.avg.current}${data.avg.target != null ? ` / TARGET ${data.avg.target}` : ""}`
            : "NO GRADED WORK YET"}
        </span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-3">
        {/* course cards (FR-ACAD.2 + FR-ACAD.4) */}
        {data.courses.map((c) => (
          <CourseCard key={c.id} c={c} todayISO={data.todayISO} />
        ))}

        <div className="flex flex-col gap-3">
          {/* study hours (FR-ACAD.3) */}
          <DisclosurePanel
            label="Study hours — this week"
            value="PLANNED VS ACTUAL"
            addLabel="Log study hours"
            form={(close) => (
              <form
                action={async (fd) => { await logStudyAction(fd); close(); }}
                className="flex flex-wrap gap-1.5 border-t border-border-header p-2.5"
              >
                <select name="courseId" required aria-label="Course" className="min-w-0 flex-[1_1_100px] border border-border-input bg-subtle px-1.5 py-1.5 text-[12px]">
                  {data.courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.code}</option>
                  ))}
                </select>
                <input name="hours" required inputMode="decimal" placeholder="h" aria-label="Hours studied" className={`${numCls} w-[52px] py-1.5`} />
                <input type="date" name="date" defaultValue={data.todayISO} aria-label="Study date" className={`${inputCls} py-1.5 font-mono text-[11px]`} />
                <SubmitButton className={`${addBtn} px-2.5 py-1.5 text-[10px]`}>Log</SubmitButton>
              </form>
            )}
            footer={
              <div className="border-t border-border-row px-3 py-2 font-mono text-[10px] uppercase tracking-[.03em] text-faint">
                {data.paceLine}
              </div>
            }
          >
            {data.study.length === 0 && (
              <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
                Add a course to plan study hours
              </p>
            )}
            {data.study.map((s) => (
              <div key={s.courseId} className="border-b border-border-row px-3 py-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px]">{s.code}</span>
                  <span className="font-mono text-[11px] text-muted">
                    {s.planned != null
                      ? `${s.actual.toFixed(1)} / ${s.planned.toFixed(1)} H`
                      : `${s.actual.toFixed(1)} H · NO WEEKLY PLAN`}
                  </span>
                </div>
                <div className="mt-1.5 h-1 bg-track">
                  <div
                    className={`h-1 ${studyTone(s.actual, s.planned)}`}
                    style={{
                      width: s.planned
                        ? `${Math.min(100, (s.actual / s.planned) * 100)}%`
                        : "0%",
                    }}
                  />
                </div>
              </div>
            ))}
          </DisclosurePanel>

          {/* academic goal tree — the engine, not a parallel structure (FR-ACAD.1) */}
          <Panel label="Goals" value="VIA GOAL ENGINE">
            {data.goals.length === 0 && (
              <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
                No academic goals — <Link href="/goals/new">create the direction goal</Link>
              </p>
            )}
            {data.goals.map((g) => (
              <GoalProgressRow key={g.id} goal={g} />
            ))}
          </Panel>

          {/* add course */}
          <DisclosurePanel
            label="Add course"
            addLabel="Add course"
            form={(close) => (
              <form
                action={async (fd) => { await addCourseAction(fd); close(); }}
                className="flex flex-wrap gap-1.5 border-t border-border-header p-3"
              >
                <input name="code" required placeholder="CODE" aria-label="Course code" autoComplete="off" className={`${inputCls} w-[104px] font-mono uppercase`} />
                <input name="name" required placeholder="Course name" aria-label="Course name" autoComplete="off" className={`${inputCls} min-w-0 flex-[2_1_140px]`} />
                <input name="semester" placeholder="S2 2026" aria-label="Semester" autoComplete="off" className={`${inputCls} w-[92px] font-mono`} />
                <input name="targetGrade" inputMode="decimal" placeholder="target %" aria-label="Target grade" className={`${numCls} w-[76px]`} />
                <input name="plannedHours" inputMode="decimal" placeholder="h/wk" aria-label="Planned study hours per week" className={`${numCls} w-[62px]`} />
                <SubmitButton className={addBtn}>Add</SubmitButton>
              </form>
            )}
          >
            <p className="px-3 py-2.5 font-mono text-[9px] uppercase tracking-[.06em] text-faintest">
              Tap + to add a course. Link it to its goal from the course page — nesting lives in the goal engine.
            </p>
          </DisclosurePanel>
        </div>
      </div>
    </main>
  );
}
