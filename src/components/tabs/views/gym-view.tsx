"use client";

import Link from "next/link";
import { useState } from "react";
import { startSessionAction } from "@/app/gym/actions";
import { E1rmChart } from "@/components/gym/e1rm-chart";
import { SessionLogger } from "@/components/gym/session-logger";
import { DisclosurePanel } from "@/components/disclosure-panel";
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
  const chartLift = picked && lifts.includes(picked) ? picked : lifts[0] ?? null;
  const active = data.sessions.find((s) => s.id === data.activeSessionId) ?? null;
  const series = chartLift ? data.seriesByLift[chartLift] ?? [] : [];
  const last8 = aggregateAdherence(data.weeks);
  const thisWeek = data.weeks[data.weeks.length - 1] ?? { planned: 0, completed: 0 };

  // State 2: Active Session
  if (active) {
    return (
      <main className="mx-auto w-full max-w-[720px] p-4">
        <SessionLogger
          sessionId={active.id}
          name={active.name}
          dateLabel={dowDate(active.dateISO)}
          exercises={active.exercises}
          lastByExercise={data.lastByExercise}
        />
      </main>
    );
  }

  // Default View: Templates and Stats
  return (
    <main className="mx-auto w-full max-w-[1280px] columns-[330px] gap-3 [&>*]:mb-3 [&>*]:break-inside-avoid [&>*]:inline-block [&>*]:w-full p-4">
      <Panel
        label="Start session"
        value={`${data.templates.length} templates`}
      >
        {data.templates.length === 0 && (
          <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
            No templates yet
          </p>
        )}
        <div className="flex flex-col gap-0 border-b border-border-row">
          {data.templates.map((t, i) => (
            <form key={t.id} action={startSessionAction} className={`block w-full text-left ${i > 0 ? "border-t border-border-row" : ""}`}>
              <input type="hidden" name="templateId" value={t.id} />
              <input type="hidden" name="date" value={data.todayISO} />
              <button type="submit" className="w-full cursor-pointer text-left bg-transparent hover:bg-subtle transition-colors">
                <div className="px-3 py-2.5">
                  <div className="font-mono text-[12.5px] font-semibold mb-1.5">{t.name}</div>
                  <div className="flex flex-col gap-1">
                    {t.exercises.map((ex) => (
                      <div key={ex.name} className="flex justify-between font-mono text-[10px] text-faint">
                        <span>{ex.targetSets} × {ex.name}</span>
                        <span>
                          {ex.targetReps} reps {ex.targetKg ? `@ ${ex.targetKg}kg` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </button>
            </form>
          ))}
        </div>
        <Link
          href="/gym/templates/new"
          className="block w-full bg-subtle px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] no-underline hover:bg-surface transition-colors"
        >
          New template →
        </Link>
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
    </main>
  );
}
