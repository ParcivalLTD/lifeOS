"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  addAchievementAction,
  addProjectAction,
  archiveAchievementAction,
  logTimeAction,
  toggleTimerAction,
} from "@/app/work/actions";
import { GoalProgressRow } from "@/components/goals/goal-progress-row";
import { Panel } from "@/components/panel";
import { SubmitButton } from "@/components/submit-button";
import { SwipeableRow } from "@/components/swipeable-row";
import { parseISODate } from "@/lib/dates";
import { achievementDate, achievementsText, elapsedHM } from "@/lib/work";
import type { WorkData } from "@/lib/tab-data";

const inputCls = "border border-border-input bg-subtle px-2.5 py-2 text-[12.5px]";
const addBtn = "cursor-pointer border-0 bg-ink px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#ffffff] disabled:opacity-50";
const chipBtn = "cursor-pointer border border-border-input bg-subtle px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[.05em] disabled:opacity-50";

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const dueLabel = (iso: string) => {
  const d = parseISODate(iso);
  return `DUE ${MONTHS[d.getMonth()]} ${d.getDate()}`;
};

/** Timer toggle: idle = ▶ START; running = ■ H:MM ticking live (FR-WORK.4). */
function TimerButton({ projectId, startedAt }: { projectId: string; startedAt: string | null }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, [startedAt]);
  return (
    <form action={toggleTimerAction}>
      <input type="hidden" name="projectId" value={projectId} />
      <SubmitButton
        className={
          startedAt
            ? "cursor-pointer border border-ink bg-ink px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[.05em] text-[#ffffff] disabled:opacity-50"
            : chipBtn
        }
      >
        {startedAt ? `■ ${elapsedHM(startedAt, now)}` : "▶ Start"}
      </SubmitButton>
    </form>
  );
}

function QuickLog({ projectId, hours, label }: { projectId: string; hours: number; label: string }) {
  return (
    <form action={logTimeAction}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="hours" value={hours} />
      <SubmitButton className={chipBtn}>{label}</SubmitButton>
    </form>
  );
}

function CopyAchievements({ rows }: { rows: WorkData["achievements"] }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(achievementsText(rows));
        setCopied(true);
      }}
      className="block w-full cursor-pointer border-0 border-t border-border-header bg-subtle px-3 py-2 text-left font-mono text-[11px] font-semibold uppercase tracking-[.06em]"
    >
      {copied ? "Copied ✓" : "Copy as text — CV / review"}
    </button>
  );
}

export function WorkViewTab({ data }: { data: WorkData }) {
  const [, startTransition] = useTransition();

  return (
    <main className="mx-auto grid w-full max-w-[1280px] grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-3 p-4">
      {/* projects with deadlines + next actions + time (FR-WORK.2/4) */}
      <Panel
        label="Projects"
        value={`${data.projects.length} active`}
        footer={
          <>
            <div className="border-t border-border-row px-3 py-2 font-mono text-[10px] uppercase tracking-[.03em] text-faint">
              {data.weekTotal.projects > 0
                ? `TIME THIS WEEK: ${data.weekTotal.hours} H TRACKED ACROSS ${data.weekTotal.projects} PROJECT${data.weekTotal.projects === 1 ? "" : "S"}`
                : "NO TIME TRACKED THIS WEEK"}
            </div>
            <form action={addProjectAction} className="flex flex-wrap gap-1.5 border-t border-border-header p-3">
              <input name="title" required placeholder="Project" aria-label="Project name" autoComplete="off" className={`${inputCls} min-w-0 flex-[2_1_140px]`} />
              <input type="date" name="due" required defaultValue={data.todayISO} aria-label="Deadline" className={`${inputCls} font-mono`} />
              <SubmitButton className={addBtn}>Add</SubmitButton>
            </form>
          </>
        }
      >
        {data.projects.length === 0 && (
          <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
            No projects yet — add one below
          </p>
        )}
        {data.projects.map((p) => (
          <div key={p.id} className="border-b border-border-row px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <Link href={`/work/projects/${p.id}`} className="min-w-0 truncate text-[12.5px] font-semibold no-underline">
                {p.title}
              </Link>
              <span className="flex-none font-mono text-[10px] text-muted">{dueLabel(p.dueISO)}</span>
            </div>
            <div className="mt-0.5 truncate text-[12px]">
              {p.next ? (
                <>Next: {p.next.title}</>
              ) : p.goalId ? (
                <span className="text-faint">No open tasks — add next actions on Tasks (goal: {p.goalTitle})</span>
              ) : (
                <span className="text-faint">
                  No linked goal — <Link href={`/work/projects/${p.id}`}>link one</Link> to pull next actions
                </span>
              )}
            </div>
            <div className="mt-1.5 flex items-baseline justify-between">
              <span className="font-mono text-[10px] tracking-[.03em] text-faint">
                {p.weekHours > 0 ? `${p.weekHours} H THIS WK` : "0 H THIS WK"}
              </span>
              <span className="font-mono text-[10px] tracking-[.03em] text-faint">
                {p.tasksTotal > 0 ? `${p.tasksDone} OF ${p.tasksTotal} TASKS` : "NO TASKS YET"}
              </span>
            </div>
            {p.tasksTotal > 0 && (
              <div className="mt-1 h-1 bg-track">
                <div className="h-1 bg-domain-work" style={{ width: `${Math.round((p.tasksDone / p.tasksTotal) * 100)}%` }} />
              </div>
            )}
            <div className="mt-1.5 flex items-center gap-1.5" data-no-swipe>
              <TimerButton projectId={p.id} startedAt={p.timerStartedAt} />
              <QuickLog projectId={p.id} hours={0.5} label="+30m" />
              <QuickLog projectId={p.id} hours={1} label="+1h" />
            </div>
          </div>
        ))}
      </Panel>

      {/* achievements log (FR-WORK.3) */}
      <Panel
        label="Achievements log"
        value="DATED WINS · CV-READY"
        footer={
          <>
            <CopyAchievements rows={data.achievements} />
            <form action={addAchievementAction} className="flex flex-wrap gap-1.5 border-t border-border-header p-3">
              <input name="title" required placeholder="Win" aria-label="Achievement" autoComplete="off" className={`${inputCls} min-w-0 flex-[3_1_150px]`} />
              <input name="context" placeholder="Context" aria-label="Context" autoComplete="off" className={`${inputCls} w-[90px]`} />
              <input type="date" name="date" defaultValue={data.todayISO} aria-label="Date" className={`${inputCls} font-mono`} />
              <SubmitButton className={addBtn}>Log</SubmitButton>
            </form>
          </>
        }
      >
        {data.achievements.length === 0 && (
          <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
            No wins logged yet — future you writes the CV
          </p>
        )}
        {data.achievements.map((a) => (
          <SwipeableRow
            key={a.id}
            rightAction={{
              label: "Delete",
              tone: "bad",
              onAction: () => startTransition(() => archiveAchievementAction(a.id)),
            }}
          >
            <div className="flex items-baseline gap-2.5 border-b border-border-row px-3 py-2">
              <span className="w-[70px] flex-none font-mono text-[10px] text-faint">
                {achievementDate(a.dateISO)}
              </span>
              <span className="min-w-0 flex-1 text-[12.5px]">{a.title}</span>
              {a.context && (
                <span className="flex-none font-mono text-[10px] uppercase text-faint">{a.context}</span>
              )}
            </div>
          </SwipeableRow>
        ))}
      </Panel>

      {/* career goals — the engine, not a parallel structure (FR-WORK.1) */}
      <Panel label="Career goals" value="VIA GOAL ENGINE">
        {data.goals.length === 0 && (
          <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
            No work goals — <Link href="/goals/new">create one</Link>
          </p>
        )}
        {data.goals.map((g) => (
          <GoalProgressRow key={g.id} goal={g} />
        ))}
      </Panel>
    </main>
  );
}
