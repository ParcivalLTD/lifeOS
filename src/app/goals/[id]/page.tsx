import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  attachHabitAction,
  deleteLinkAction,
  detachHabitAction,
  linkGoalAction,
  linkMetricAction,
} from "@/app/goals/actions";
import { AppHeader } from "@/components/app-header";
import { GoalProgressRow } from "@/components/goals/goal-progress-row";
import { MetricTrend } from "@/components/goals/metric-trend";
import { Panel } from "@/components/panel";
import { requireUser } from "@/lib/auth";
import {
  getGoalDetail,
  goalHabitOptions,
  goalMetricOptions,
  goalOptions,
} from "@/lib/data/goals";
import { DOMAIN_DOT_CLASS } from "@/lib/domains";
import { HORIZON_LABEL } from "@/lib/goals";

export const metadata: Metadata = { title: "LIFEOS — GOAL" };

const smallSelect = "min-w-0 flex-1 border border-border-input bg-subtle px-1.5 py-1.5 text-[12px]";
const addBtn = "cursor-pointer border-0 bg-ink px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#ffffff]";
const RELATION_LABEL: Record<string, string> = { funds: "funds", supports: "supports", blocks: "blocks", "relates-to": "relates to" };

export default async function GoalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const detail = await getGoalDetail(user.id, id);
  if (!detail) notFound();

  const [habitOpts, metricOpts, goalOpts] = await Promise.all([
    goalHabitOptions(user.id),
    goalMetricOptions(user.id),
    goalOptions(user.id),
  ]);
  const linkedHabitIds = new Set(detail.habits.map((h) => h.id));
  const linkedMetricIds = new Set(detail.metrics.map((m) => m.metricId));
  const unlinkedHabits = habitOpts.filter((h) => !linkedHabitIds.has(h.id));
  const unlinkedMetrics = metricOpts.filter((m) => !linkedMetricIds.has(m.id));
  const otherGoals = goalOpts.filter((ggg) => ggg.id !== id);

  return (
    <>
      <AppHeader active="goals" />
      <main className="mx-auto grid w-full max-w-[1280px] grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-3 p-4">
        {/* outcome + progress */}
        <Panel
          label={`${HORIZON_LABEL[detail.horizon]} goal`}
          value={detail.status.toUpperCase()}
          footer={
            <div className="border-t border-border-header px-3 py-2">
              <Link href={`/goals/${id}/edit`} className="font-mono text-[10px] font-semibold uppercase tracking-[.06em]">Edit goal →</Link>
            </div>
          }
        >
          <div className="flex flex-col gap-2 p-3">
            <div className="flex items-baseline gap-2">
              <span className={`mt-1 h-[8px] w-[8px] flex-none self-start ${DOMAIN_DOT_CLASS[detail.domain]}`} />
              <h1 className="text-[15px] font-semibold leading-tight">{detail.title}</h1>
            </div>
            {detail.parent && (
              <div className="font-mono text-[10px] uppercase tracking-[.03em] text-faint">
                MILESTONE OF <Link href={`/goals/${detail.parent.id}`}>{detail.parent.title}</Link>
              </div>
            )}
            {detail.successCriteria && <p className="text-[12.5px] text-muted">{detail.successCriteria}</p>}
            {detail.description && <p className="text-[12px] text-faint">{detail.description}</p>}
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1.5 flex-1 bg-track">
                <div className={`h-1.5 ${DOMAIN_DOT_CLASS[detail.domain]}`} style={{ width: `${detail.progress.pct}%` }} />
              </div>
              <span className="font-mono text-[15px] font-semibold">{detail.progress.pct}%</span>
            </div>
            <div className="font-mono text-[9px] uppercase tracking-[.06em] text-faintest">
              PROGRESS FROM {detail.progress.basis === "none" ? "—" : detail.progress.basis}
              {detail.targetDate ? ` · TARGET ${detail.targetDate}` : ""}
            </div>
          </div>
        </Panel>

        {/* milestones (child goals) */}
        <Panel
          label="Milestones"
          value={`${detail.children.length}`}
          footer={
            <Link href={`/goals/new?parent=${id}`} className="block border-t border-border-header bg-subtle px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] no-underline">
              Add milestone →
            </Link>
          }
        >
          {detail.children.length === 0 && (
            <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">No child goals</p>
          )}
          {detail.children.map((c) => (
            <GoalProgressRow key={c.id} goal={c} />
          ))}
        </Panel>

        {/* recurring actions (habits) — adherence (FR-GOAL.3) */}
        <Panel
          label="Recurring actions"
          value={`${detail.habits.length}`}
          footer={
            unlinkedHabits.length > 0 ? (
              <form action={attachHabitAction} className="flex gap-1.5 border-t border-border-header p-3">
                <input type="hidden" name="goalId" value={id} />
                <select name="habitId" aria-label="Habit" className={smallSelect}>
                  {unlinkedHabits.map((h) => (
                    <option key={h.id} value={h.id}>{h.title}</option>
                  ))}
                </select>
                <button type="submit" className={addBtn}>Link</button>
              </form>
            ) : undefined
          }
        >
          {detail.habits.length === 0 && (
            <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">No linked habits</p>
          )}
          {detail.habits.map((h) => (
            <div key={h.id} className="flex items-baseline gap-2.5 border-b border-border-row px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{h.title}</span>
              <span className="font-mono text-[11px] text-muted">{h.adherence7}% 7D</span>
              <form action={detachHabitAction}>
                <input type="hidden" name="goalId" value={id} />
                <input type="hidden" name="habitId" value={h.id} />
                <button type="submit" aria-label={`Unlink ${h.title}`} className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[11px] text-faintest">✕</button>
              </form>
            </div>
          ))}
        </Panel>

        {/* linked metrics — progress (FR-GOAL.3) */}
        <Panel
          label="Linked metrics"
          value={`${detail.metrics.length}`}
          footer={
            unlinkedMetrics.length > 0 ? (
              <form action={linkMetricAction} className="flex gap-1.5 border-t border-border-header p-3">
                <input type="hidden" name="goalId" value={id} />
                <input type="hidden" name="domain" value={detail.domain} />
                <select name="metricId" aria-label="Metric" className={smallSelect}>
                  {unlinkedMetrics.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <button type="submit" className={addBtn}>Link</button>
              </form>
            ) : undefined
          }
        >
          {detail.metrics.length === 0 && (
            <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">No linked metrics</p>
          )}
          {detail.metrics.map((m) => (
            <div key={m.metricId} className="border-b border-border-row px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px]">{m.name}</span>
                <span className="font-mono text-[11px] text-muted">
                  {m.current ?? "—"}{m.target ? ` / ${m.target}` : ""}{m.unit ? ` ${m.unit}` : ""}
                  {m.pct != null ? ` · ${m.pct}%` : ""}
                </span>
              </div>
              <div className="mt-1.5">
                <MetricTrend points={m.trend} domain={detail.domain} />
              </div>
            </div>
          ))}
        </Panel>

        {/* funding savings (finance funds→ this goal) */}
        {detail.savings.length > 0 && (
          <Panel label="Funded by" value={`${detail.savings.length}`}>
            {detail.savings.map((s) => (
              <div key={s.id} className="flex items-baseline gap-2.5 border-b border-border-row px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[12.5px]">{s.name}</span>
                <span className="font-mono text-[11px] text-muted">{s.pct}%</span>
              </div>
            ))}
          </Panel>
        )}

        {/* cross-domain links (FR-GOAL.4) */}
        <Panel
          label="Links"
          value={`${detail.crossLinks.length}`}
          footer={
            otherGoals.length > 0 ? (
              <form action={linkGoalAction} className="flex flex-wrap gap-1.5 border-t border-border-header p-3">
                <input type="hidden" name="fromId" value={id} />
                <input type="hidden" name="domain" value={detail.domain} />
                <select name="relation" aria-label="Relation" defaultValue="supports" className="border border-border-input bg-subtle px-1.5 py-1.5 text-[12px]">
                  <option value="supports">SUPPORTS</option>
                  <option value="funds">FUNDS</option>
                  <option value="blocks">BLOCKS</option>
                  <option value="relates-to">RELATES TO</option>
                </select>
                <select name="toId" aria-label="Target goal" className={smallSelect}>
                  {otherGoals.map((gg) => (
                    <option key={gg.id} value={gg.id}>{gg.title}</option>
                  ))}
                </select>
                <button type="submit" className={addBtn}>Link</button>
              </form>
            ) : undefined
          }
        >
          {detail.crossLinks.length === 0 && (
            <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">No cross-domain links</p>
          )}
          {detail.crossLinks.map((l) => (
            <div key={l.linkId} className="flex items-baseline gap-2.5 border-b border-border-row px-3 py-2">
              <span className="w-[86px] flex-none font-mono text-[10px] uppercase tracking-[.03em] text-faint">
                {l.direction === "out" ? "" : "← "}{RELATION_LABEL[l.relation]}{l.direction === "out" ? " →" : ""}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{l.title}</span>
              <form action={deleteLinkAction}>
                <input type="hidden" name="linkId" value={l.linkId} />
                <input type="hidden" name="goalId" value={id} />
                <button type="submit" aria-label="Remove link" className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[11px] text-faintest">✕</button>
              </form>
            </div>
          ))}
        </Panel>
      </main>
    </>
  );
}
