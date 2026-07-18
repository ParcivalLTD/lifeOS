"use client";

import Link from "next/link";
import { useState } from "react";
import { startSessionAction } from "@/app/gym/actions";
import { E1rmChart } from "@/components/gym/e1rm-chart";
import { SessionLogger } from "@/components/gym/session-logger";
import { Panel } from "@/components/panel";
import { SubmitButton } from "@/components/submit-button";
import { parseISODate } from "@/lib/dates";
import { aggregateAdherence, round1 } from "@/lib/gym";
import type { GymData } from "@/lib/tab-data";

const selectCls = "border border-border-input bg-subtle px-1.5 py-2 text-[12px]";
const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const DOW = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
const shortDate = (iso: string) => {
  const d = parseISODate(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};
const dowDate = (iso: string) => {
  const d = parseISODate(iso);
  return `${DOW[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

/** Gym inside the track: lift picker is client state (all series in the DTO). */
export function GymViewTab({ data }: { data: GymData }) {
  const lifts = data.prs.map((p) => p.lift);
  const [picked, setChartLift] = useState<string | null>(data.chartLift);
  // derived, not synced state: survives data refreshes and empty→populated PRs
  const chartLift = picked && lifts.includes(picked) ? picked : lifts[0] ?? null;
  const active = data.sessions.find((s) => s.id === data.activeSessionId) ?? null;
  const series = chartLift ? data.seriesByLift[chartLift] ?? [] : [];
  const last8 = aggregateAdherence(data.weeks);
  const thisWeek = data.weeks[data.weeks.length - 1] ?? { planned: 0, completed: 0 };

  return (
    <main className="mx-auto grid w-full max-w-[1280px] grid-cols-[repeat(auto-fit,minmax(330px,1fr))] items-start gap-3 p-4">
      {active ? (
        <SessionLogger
          sessionId={active.id}
          name={active.name}
          dateLabel={dowDate(active.dateISO)}
          exercises={active.exercises}
          lastByExercise={data.lastByExercise}
        />
      ) : (
        <Panel label="Session">
          <p className="px-3 py-3 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
            No sessions yet — start one from a template below.
          </p>
        </Panel>
      )}

      <div className="flex flex-col gap-3">
        <Panel label="Start session">
          {data.templates.length === 0 ? (
            <p className="px-3 py-3 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
              No templates yet — <Link href="/gym/templates/new">create one</Link>.
            </p>
          ) : (
            <form action={startSessionAction} className="flex flex-wrap items-stretch gap-1.5 p-3">
              <select name="templateId" aria-label="Template" className={`${selectCls} min-w-0 flex-[2_1_140px]`}>
                {data.templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <input type="date" name="date" defaultValue={data.todayISO} aria-label="Date" className={`${selectCls} font-mono`} />
              <SubmitButton>Start</SubmitButton>
            </form>
          )}
        </Panel>

        <Panel label="Estimated 1RM — PRs" value={`${data.prs.length} lifts`}>
          {data.prs.length === 0 && (
            <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
              Log a session to set your first PRs
            </p>
          )}
          {data.prs.map((p) => (
            <div key={p.lift} className="flex items-baseline gap-2.5 border-b border-border-row px-3 py-2">
              <span className="flex-1 text-[12.5px]">{p.lift}</span>
              <span className="font-mono text-[12px] font-semibold">{round1(p.e1rm)} kg</span>
              <span className="w-[46px] text-right font-mono text-[10px] text-faint">{shortDate(p.whenISO)}</span>
            </div>
          ))}
        </Panel>

        <Panel label={chartLift ? `${chartLift} e1RM — last 8 weeks` : "e1RM — last 8 weeks"}>
          {lifts.length > 0 && (
            <div className="flex flex-wrap gap-1 border-b border-border-row px-3 py-2">
              {lifts.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setChartLift(l)}
                  className={`cursor-pointer border px-1.5 py-1 font-mono text-[10px] uppercase tracking-[.04em] ${
                    l === chartLift ? "border-ink bg-ink text-[#ffffff]" : "border-border-input bg-surface text-ink"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
          <E1rmChart points={series} />
        </Panel>

        <Panel label="Adherence — this week">
          <div className="flex items-center gap-2 p-3">
            <div className="flex gap-2">
              {data.weekDays.length === 0 && (
                <span className="font-mono text-[10px] uppercase text-faint">No sessions</span>
              )}
              {data.weekDays.map((d) => (
                <div key={d.dateISO} className="flex flex-col items-center gap-1">
                  <div
                    className={`flex h-7 w-7 items-center justify-center border-[1.5px] border-ink font-mono text-[11px] font-semibold ${
                      d.done ? "bg-ink text-[#ffffff]" : "bg-surface text-ink"
                    }`}
                  >
                    {d.label}
                  </div>
                  <span className="font-mono text-[9px] uppercase text-faint">{d.done ? "DONE" : "PLAN"}</span>
                </div>
              ))}
            </div>
            <div className="flex-1" />
            <div className="text-right">
              <div className="font-mono text-[16px] font-semibold">
                {thisWeek.completed} / {thisWeek.planned}
              </div>
              <div className="font-mono text-[10px] text-faint">{last8.pct}% LAST 8 WKS</div>
            </div>
          </div>
        </Panel>

        <Panel
          label="Templates"
          value={`${data.templates.length}`}
          footer={
            <Link
              href="/gym/templates/new"
              className="block border-t border-border-header bg-subtle px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] no-underline"
            >
              New template →
            </Link>
          }
        >
          {data.templates.length === 0 && (
            <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">No templates yet</p>
          )}
          {data.templates.map((t) => (
            <Link
              key={t.id}
              href={`/gym/templates/${t.id}`}
              className="flex items-baseline gap-2.5 border-b border-border-row px-3 py-2 no-underline"
            >
              <span className="flex-1 text-[12.5px]">{t.name}</span>
              <span className="font-mono text-[10px] uppercase text-faint">{t.exercises.length} exercises</span>
            </Link>
          ))}
        </Panel>
      </div>
    </main>
  );
}
