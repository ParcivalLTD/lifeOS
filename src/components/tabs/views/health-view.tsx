"use client";

import Link from "next/link";
import { useRef } from "react";
import { logHealthMetricAction } from "@/app/health/actions";
import { DaySeriesChart, EmptySeries, SleepStagesChart } from "@/components/health/charts";
import { SleepAnalysisPanel } from "@/components/health/sleep-analysis";
import { Panel } from "@/components/panel";
import { SubmitButton } from "@/components/submit-button";
import type { HealthData } from "@/lib/tab-data";

const inputCls =
  "w-full border border-border-input bg-subtle px-2 py-2 font-mono text-[12px]";

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toString();

/**
 * Health inside the track (FR-HLTH.1/.3): trend panels over the health
 * Metrics — synced (Google Health) and manual rows are the SAME series.
 * Charts reuse the Gym flat-bar language; sleep gets the stacked stage
 * breakdown. Quick-log covers the manual FR-HLTH.1 path (weight, sleep).
 */
export function HealthViewTab({ data }: { data: HealthData }) {
  const weightForm = useRef<HTMLFormElement>(null);
  const sleepForm = useRef<HTMLFormElement>(null);

  const syncLine = !data.ghealth
    ? null
    : data.ghealth.status === "ok" || data.ghealth.status === "expiring"
      ? `Google Health connected${data.ghealth.lastSyncAt ? ` — last sync ${new Date(data.ghealth.lastSyncAt).toLocaleString()}` : " — awaiting first webhook"}`
      : "Google Health connection needs attention — see Settings";

  return (
    <main className="mx-auto w-full max-w-[1280px] p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[.06em] text-faint">
          {syncLine ?? "Not connected to Google Health — synced trends appear once connected"}
        </p>
        <Link
          href="/settings"
          className="font-mono text-[10px] uppercase tracking-[.05em] text-faint underline underline-offset-2"
        >
          {data.ghealth ? "Manage connection" : "Connect in Settings"} →
        </Link>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-3">
        {/* WEIGHT */}
        <Panel
          label="Weight"
          value={
            data.weight.latest !== null
              ? `${fmt1(data.weight.latest)} kg${
                  data.weight.delta30 !== null
                    ? ` · ${data.weight.delta30 > 0 ? "+" : ""}${fmt1(data.weight.delta30)} / 30d`
                    : ""
                }`
              : undefined
          }
        >
          {data.weight.series.length > 0 ? (
            <DaySeriesChart points={data.weight.series} unit="kg" />
          ) : (
            <EmptySeries text="No weight entries yet — log below or connect Google Health" />
          )}
          <form
            ref={weightForm}
            action={async (fd) => {
              await logHealthMetricAction(fd);
              weightForm.current?.reset();
            }}
            className="flex items-stretch gap-2 border-t border-border-row p-3"
          >
            <input type="hidden" name="key" value="weight" />
            <input type="hidden" name="date" value={data.todayISO} />
            <input
              name="value"
              inputMode="decimal"
              placeholder="kg"
              required
              className={inputCls}
              aria-label="Body weight in kilograms"
            />
            <SubmitButton>Log</SubmitButton>
          </form>
        </Panel>

        {/* SLEEP */}
        <Panel
          label="Sleep — last 14 nights"
          value={data.sleep.avg7 !== null ? `avg ${fmt1(data.sleep.avg7)} h / 7d` : undefined}
        >
          {data.sleep.nights.length > 0 ? (
            <SleepStagesChart nights={data.sleep.nights} />
          ) : (
            <EmptySeries text="No sleep data yet — log hours below or connect Google Health" />
          )}
          <form
            ref={sleepForm}
            action={async (fd) => {
              await logHealthMetricAction(fd);
              sleepForm.current?.reset();
            }}
            className="flex items-stretch gap-2 border-t border-border-row p-3"
          >
            <input type="hidden" name="key" value="sleepHours" />
            <input type="hidden" name="date" value={data.todayISO} />
            <input
              name="value"
              inputMode="decimal"
              placeholder="hours last night"
              required
              className={inputCls}
              aria-label="Sleep hours last night"
            />
            <SubmitButton>Log</SubmitButton>
          </form>
        </Panel>

        {/* SLEEP ANALYSIS (stage 4 — basis-stated, never fabricated) */}
        <SleepAnalysisPanel analysis={data.sleepAnalysis} />

        {/* STEPS */}
        <Panel
          label="Steps — last 14 days"
          value={
            data.steps.avg7 !== null
              ? `${data.steps.today !== null ? `today ${data.steps.today.toLocaleString()} · ` : ""}avg ${data.steps.avg7.toLocaleString()} / 7d`
              : undefined
          }
        >
          {data.steps.series.length > 0 ? (
            <DaySeriesChart points={data.steps.series} unit="steps" decimals={0} />
          ) : (
            <EmptySeries text="No step data yet — syncs from Google Health (multi-source reconciled)" />
          )}
        </Panel>

        {/* HEART & OXYGEN */}
        <Panel
          label="Heart & oxygen — 30 days"
          value={
            data.heart.restingLatest !== null || data.heart.hrvLatest !== null
              ? [
                  data.heart.restingLatest !== null ? `${Math.round(data.heart.restingLatest)} bpm` : null,
                  data.heart.hrvLatest !== null ? `HRV ${Math.round(data.heart.hrvLatest)} ms` : null,
                  data.heart.spo2Latest !== null ? `SpO₂ ${fmt1(data.heart.spo2Latest)}%` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : undefined
          }
        >
          {data.heart.resting.length > 0 ? (
            <>
              <p className="px-3 pt-2 font-mono text-[9px] font-semibold uppercase tracking-[.07em] text-faint">
                Resting heart rate
              </p>
              <DaySeriesChart points={data.heart.resting} unit="bpm" height={44} decimals={0} />
            </>
          ) : (
            <EmptySeries text="No resting heart-rate data yet" />
          )}
          {data.heart.hrv.length > 0 && (
            <>
              <p className="border-t border-border-row px-3 pt-2 font-mono text-[9px] font-semibold uppercase tracking-[.07em] text-faint">
                HRV
              </p>
              <DaySeriesChart points={data.heart.hrv} unit="ms" height={44} decimals={0} />
            </>
          )}
          {data.heart.spo2.length > 0 && (
            <>
              <p className="border-t border-border-row px-3 pt-2 font-mono text-[9px] font-semibold uppercase tracking-[.07em] text-faint">
                SpO₂
              </p>
              <DaySeriesChart points={data.heart.spo2} unit="%" height={44} />
            </>
          )}
        </Panel>

        {/* NUTRITION */}
        <Panel
          label="Nutrition — last 7 days"
          value={
            data.nutrition.today?.kcal != null
              ? `today ${data.nutrition.today.kcal.toLocaleString()} kcal`
              : undefined
          }
        >
          {data.nutrition.days.length > 0 ? (
            <>
              <DaySeriesChart
                points={data.nutrition.days
                  .filter((d) => d.kcal !== null)
                  .map((d) => ({ dateISO: d.dateISO, value: d.kcal! }))}
                unit="kcal"
                decimals={0}
              />
              <div className="border-t border-border-row">
                {data.nutrition.days
                  .slice(-3)
                  .reverse()
                  .map((d) => (
                    <div
                      key={d.dateISO}
                      className="flex items-baseline justify-between gap-2 border-b border-border-row px-3 py-1.5 last:border-b-0"
                    >
                      <span className="font-mono text-[10px] uppercase text-faint">{d.dateISO}</span>
                      <span className="font-mono text-[11px] text-muted">
                        {d.kcal != null ? `${d.kcal.toLocaleString()} kcal` : "—"}
                        {" · P "}{d.protein != null ? `${fmt1(d.protein)}g` : "—"}
                        {" · C "}{d.carbs != null ? `${fmt1(d.carbs)}g` : "—"}
                        {" · F "}{d.fat != null ? `${fmt1(d.fat)}g` : "—"}
                      </span>
                    </div>
                  ))}
              </div>
            </>
          ) : (
            <EmptySeries text="No nutrition data yet — syncs from Google Health nutrition log" />
          )}
        </Panel>
      </div>

      <p className="mt-3 font-mono text-[9px] uppercase tracking-[.05em] text-faintest">
        Synced series update via Google Health webhooks (read-only mirror) ·
        manual logs and synced datapoints share the same metrics
      </p>
    </main>
  );
}
