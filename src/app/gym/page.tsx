import type { Metadata } from "next";
import Link from "next/link";
import { startSessionAction } from "@/app/gym/actions";
import { AppHeader } from "@/components/app-header";
import { E1rmChart } from "@/components/gym/e1rm-chart";
import { SessionLogger } from "@/components/gym/session-logger";
import { Panel } from "@/components/panel";
import { requireUser } from "@/lib/auth";
import {
  getSession,
  listPRs,
  listSessions,
  listTemplates,
  liftSeries,
  previousSession,
  thisWeekDays,
  weeklyAdherence,
} from "@/lib/data/gym";
import { parseISODate, todayISO } from "@/lib/dates";
import { aggregateAdherence, lastSetsSummary, round1 } from "@/lib/gym";

export const metadata: Metadata = { title: "LIFEOS — GYM" };

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

const selectCls = "border border-border-input bg-subtle px-1.5 py-2 text-[12px]";

export default async function GymPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; lift?: string }>;
}) {
  const user = await requireUser();
  const { session: sessionId, lift: liftParam } = await searchParams;
  const today = todayISO();

  const [templates, sessions, prs, weeks, weekDays] = await Promise.all([
    listTemplates(user.id),
    listSessions(user.id, 12),
    listPRs(user.id),
    weeklyAdherence(user.id, 8),
    thisWeekDays(user.id),
  ]);

  // active session: explicit ?session, else today's, else most recent
  const active =
    (sessionId ? await getSession(user.id, sessionId) : null) ??
    sessions.find((s) => s.dateISO === today) ??
    sessions[0] ??
    null;

  const lifts = prs.map((p) => p.lift);
  const chartLift = liftParam && lifts.includes(liftParam) ? liftParam : lifts[0] ?? null;

  // independent of each other — fetch in parallel (was sequential)
  const [prev, series] = await Promise.all([
    active ? previousSession(user.id, active) : Promise.resolve(null),
    chartLift ? liftSeries(user.id, chartLift, 8) : Promise.resolve([]),
  ]);

  const lastByExercise: Record<string, string | null> = {};
  if (active && prev) {
    for (const ex of active.exercises) {
      const p = prev.exercises.find((e) => e.name === ex.name);
      lastByExercise[ex.name] = p ? lastSetsSummary(p.sets) : null;
    }
  }

  const last8 = aggregateAdherence(weeks);
  const thisWeek = weeks[weeks.length - 1] ?? { planned: 0, completed: 0 };

  return (
    <>
      <AppHeader active="gym" />
      <main className="mx-auto grid w-full max-w-[1280px] grid-cols-[repeat(auto-fit,minmax(330px,1fr))] items-start gap-3 p-4">
        {/* left: session logger or start-session */}
        {active ? (
          <SessionLogger
            sessionId={active.id}
            name={active.name}
            dateLabel={dowDate(active.dateISO)}
            exercises={active.exercises}
            lastByExercise={lastByExercise}
          />
        ) : (
          <Panel label="Session">
            <p className="px-3 py-3 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
              No sessions yet — start one from a template below.
            </p>
          </Panel>
        )}

        <div className="flex flex-col gap-3">
          {/* start a session */}
          <Panel label="Start session">
            {templates.length === 0 ? (
              <p className="px-3 py-3 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
                No templates yet — <Link href="/gym/templates/new">create one</Link>.
              </p>
            ) : (
              <form action={startSessionAction} className="flex flex-wrap items-stretch gap-1.5 p-3">
                <select name="templateId" aria-label="Template" className={`${selectCls} min-w-0 flex-[2_1_140px]`}>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <input type="date" name="date" defaultValue={today} aria-label="Date" className={`${selectCls} font-mono`} />
                <button
                  type="submit"
                  className="cursor-pointer border-0 bg-ink px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#ffffff]"
                >
                  Start
                </button>
              </form>
            )}
          </Panel>

          {/* PRs */}
          <Panel label="Estimated 1RM — PRs" value={`${prs.length} lifts`}>
            {prs.length === 0 && (
              <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
                Log a session to set your first PRs
              </p>
            )}
            {prs.map((p) => (
              <div key={p.lift} className="flex items-baseline gap-2.5 border-b border-border-row px-3 py-2">
                <span className="flex-1 text-[12.5px]">{p.lift}</span>
                <span className="font-mono text-[12px] font-semibold">{round1(p.e1rm)} kg</span>
                <span className="w-[46px] text-right font-mono text-[10px] text-faint">{shortDate(p.whenISO)}</span>
              </div>
            ))}
          </Panel>

          {/* e1RM chart */}
          <Panel label={chartLift ? `${chartLift} e1RM — last 8 weeks` : "e1RM — last 8 weeks"}>
            {lifts.length > 0 && (
              <div className="flex flex-wrap gap-1 border-b border-border-row px-3 py-2">
                {lifts.map((l) => (
                  <Link
                    key={l}
                    href={`/gym?lift=${encodeURIComponent(l)}${active ? `&session=${active.id}` : ""}`}
                    className={`border px-1.5 py-1 font-mono text-[10px] uppercase tracking-[.04em] no-underline ${
                      l === chartLift ? "border-ink bg-ink text-[#ffffff]" : "border-border-input bg-surface text-ink"
                    }`}
                  >
                    {l}
                  </Link>
                ))}
              </div>
            )}
            <E1rmChart points={series} />
          </Panel>

          {/* adherence */}
          <Panel label="Adherence — this week">
            <div className="flex items-center gap-2 p-3">
              <div className="flex gap-2">
                {weekDays.length === 0 && (
                  <span className="font-mono text-[10px] uppercase text-faint">No sessions</span>
                )}
                {weekDays.map((d) => (
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
                <div className="font-mono text-[10px] text-faint">
                  {last8.pct}% LAST 8 WKS
                </div>
              </div>
            </div>
          </Panel>

          {/* templates (FR-GYM.1) */}
          <Panel
            label="Templates"
            value={`${templates.length}`}
            footer={
              <Link
                href="/gym/templates/new"
                className="block border-t border-border-header bg-subtle px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] no-underline"
              >
                New template →
              </Link>
            }
          >
            {templates.length === 0 && (
              <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
                No templates yet
              </p>
            )}
            {templates.map((t) => (
              <Link
                key={t.id}
                href={`/gym/templates/${t.id}`}
                className="flex items-baseline gap-2.5 border-b border-border-row px-3 py-2 no-underline"
              >
                <span className="flex-1 text-[12.5px]">{t.name}</span>
                <span className="font-mono text-[10px] uppercase text-faint">
                  {t.exercises.length} exercises
                </span>
              </Link>
            ))}
          </Panel>
        </div>
      </main>
    </>
  );
}
