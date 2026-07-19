"use client";

import Link from "next/link";
import { useState } from "react";
import { saveReviewAction } from "@/app/review/actions";
import { Panel } from "@/components/panel";
import { SubmitButton } from "@/components/submit-button";
import { DOMAIN_DOT_CLASS } from "@/lib/domains";
import type { Domain } from "@/lib/domains";
import {
  REVIEW_TYPE_LABEL,
  timelineNote,
  type GoalSnapshot,
  type ReviewType,
} from "@/lib/review";
import type { ReviewData } from "@/lib/tab-data";

const labelCls = "font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faint";
const taCls = "w-full resize-y border border-border-input bg-subtle p-2 text-[12.5px]";
const chipBase = "cursor-pointer border px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[.06em]";

const FLAG_STYLE: Record<GoalSnapshot["flag"], { label: string; cls: string }> = {
  "on-track": { label: "ON TRACK", cls: "text-status-good border-status-good" },
  "at-risk": { label: "AT RISK", cls: "text-status-bad border-status-bad" },
  overdue: { label: "OVERDUE", cls: "text-status-bad border-status-bad" },
  "no-signal": { label: "NO SIGNAL", cls: "text-faint border-border-input" },
};

function StatTiles({ stats }: { stats: NonNullable<ReviewData["weekly"]["stats"]> }) {
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] border-b border-border-header">
        {stats.map((s) => (
          <div key={s.l} title={s.basis} className="-mb-px border-r border-b border-border-row bg-surface px-3 py-2.5">
            <div className="font-mono text-[17px] font-semibold">{s.v}</div>
            <div className="mt-0.5 font-mono text-[9px] font-semibold uppercase tracking-[.07em] text-faint">{s.l}</div>
          </div>
        ))}
      </div>
      {/* FR-REV.1: every figure's basis, stated — flat details, no chrome */}
      <details className="border-b border-border-row">
        <summary className="cursor-pointer list-none px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-[.08em] text-faint">
          Bases — what each figure means ▸
        </summary>
        <div className="px-3 pb-2">
          {stats.map((s) => (
            <div key={s.l} className="py-0.5 font-mono text-[9px] uppercase tracking-[.03em] text-faint">
              {s.l}: {s.basis}
            </div>
          ))}
        </div>
      </details>
    </>
  );
}

export function ReviewViewTab({ data }: { data: ReviewData }) {
  const [type, setType] = useState<ReviewType>("weekly");

  const periodKey =
    type === "weekly" ? data.weekly.periodKey : type === "monthly" ? data.monthly.key : data.quarterly.key;
  const periodLabel =
    type === "weekly" ? data.weekly.periodLabel : type === "monthly" ? data.monthly.label : data.quarterly.label;
  const existing = data.timeline.find(
    (r) => r.payload.rev === type && r.payload.periodKey === periodKey,
  );
  const saved = existing?.payload.reflections ?? {};
  const flagged = data.goalsReview.goals.filter((g) => g.flag !== "on-track");

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 p-4">
      <section className="border border-border-outer bg-surface">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-header px-3 py-2.5">
          <span className={labelCls}>
            {REVIEW_TYPE_LABEL[type]} review — {periodLabel}
          </span>
          <span className="font-mono text-[10px] text-faint">
            {type === "weekly" ? "SUMMARY AUTO-GENERATED · TARGET ≤10 MIN" : "PROGRESS VIA GOAL ENGINE · FLAGS COMPUTED"}
          </span>
        </div>

        <div className="flex gap-1 border-b border-border-header px-3 py-2">
          {(["weekly", "monthly", "quarterly"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`${chipBase} ${t === type ? "border-ink bg-ink text-[#ffffff]" : "border-border-input bg-subtle text-ink"}`}
            >
              {REVIEW_TYPE_LABEL[t]}
            </button>
          ))}
        </div>

        {type === "weekly" ? (
          <>
            <StatTiles stats={data.weekly.stats} />
            <div className="border-b border-border-row px-3 py-2.5">
              <div className={`${labelCls} mb-1.5`}>Highlights</div>
              {data.weekly.highlights.map((h) => (
                <div key={h} className="flex gap-2 py-0.5 text-[12.5px]">
                  <span className="font-mono text-[11px] text-faint">—</span>
                  {h}
                </div>
              ))}
            </div>
            <form action={saveReviewAction} key={`weekly-${periodKey}`}>
              <input type="hidden" name="type" value="weekly" />
              <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3 p-3">
                <label className="flex flex-col gap-1.5">
                  <span className={labelCls}>What worked?</span>
                  <textarea name="worked" rows={3} defaultValue={saved.worked ?? ""} placeholder="e.g. morning sessions stuck; prepped meals Sunday…" className={taCls} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={labelCls}>What didn&apos;t, and why?</span>
                  <textarea name="didnt" rows={3} defaultValue={saved.didnt ?? ""} placeholder="e.g. late nights killed Thursday…" className={taCls} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={labelCls}>Top 3 for next week</span>
                  <textarea name="top3" rows={3} defaultValue={saved.top3 ?? ""} placeholder={"1. …\n2. …\n3. …"} className={taCls} />
                </label>
              </div>
              <div className="px-3 pb-3">
                <SubmitButton className="cursor-pointer border border-ink bg-ink px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#ffffff] disabled:opacity-50">
                  {existing ? "Update review — saved ✓" : "Complete review"}
                </SubmitButton>
              </div>
            </form>
          </>
        ) : (
          <>
            {data.goalsReview.goals.length === 0 && (
              <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
                No active goals to review
              </p>
            )}
            {data.goalsReview.goals.map((g) => (
              <div key={g.id} className="border-b border-border-row px-3 py-2">
                <div className="flex items-baseline gap-2.5">
                  <span className={`h-[7px] w-[7px] flex-none self-center ${DOMAIN_DOT_CLASS[g.domain as Domain]}`} />
                  <Link href={`/goals/${g.id}`} className="min-w-0 flex-1 truncate text-[12.5px] font-medium no-underline">
                    {g.title}
                  </Link>
                  <span className="font-mono text-[11px] text-muted">{g.pct}%</span>
                  <span className={`flex-none border px-[5px] py-px font-mono text-[9px] font-semibold tracking-[.07em] ${FLAG_STYLE[g.flag].cls}`}>
                    {FLAG_STYLE[g.flag].label}
                  </span>
                </div>
                <div className="mt-1 h-1 bg-track">
                  <div className={`h-1 ${DOMAIN_DOT_CLASS[g.domain as Domain]}`} style={{ width: `${g.pct}%` }} />
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-mono text-[9px] uppercase tracking-[.03em] text-faint">
                    {g.flagBasis}
                  </span>
                  {g.flag !== "on-track" && (
                    <Link href={`/goals/${g.id}/edit`} className="flex-none font-mono text-[9px] font-semibold uppercase tracking-[.06em]">
                      Adjust / abandon →
                    </Link>
                  )}
                </div>
              </div>
            ))}
            <form action={saveReviewAction} key={`${type}-${periodKey}`}>
              <input type="hidden" name="type" value={type} />
              <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3 p-3">
                <label className="flex flex-col gap-1.5">
                  <span className={labelCls}>What moved this {type === "monthly" ? "month" : "quarter"}?</span>
                  <textarea name="moved" rows={3} defaultValue={saved.moved ?? ""} placeholder="e.g. WAM goal back on track after quiz results…" className={taCls} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={labelCls}>Adjust or abandon — decisions</span>
                  <textarea name="adjust" rows={3} defaultValue={saved.adjust ?? ""} placeholder={`${flagged.length} flagged goal${flagged.length === 1 ? "" : "s"} above — what changes?`} className={taCls} />
                </label>
              </div>
              <div className="px-3 pb-3">
                <SubmitButton className="cursor-pointer border border-ink bg-ink px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#ffffff] disabled:opacity-50">
                  {existing ? "Update review — saved ✓" : "Complete review"}
                </SubmitButton>
              </div>
            </form>
          </>
        )}
      </section>

      {/* FR-REV.3: stored reviews, browsable */}
      <Panel label="Review timeline" value={`${data.timeline.length}`}>
        {data.timeline.length === 0 && (
          <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
            No reviews yet — complete your first above
          </p>
        )}
        {data.timeline.map((r) => (
          <Link key={r.id} href={`/review/${r.id}`} className="flex items-baseline gap-3.5 border-b border-border-row px-3 py-2 no-underline">
            <span className="w-[68px] flex-none font-mono text-[11px] font-semibold">
              {r.payload.rev === "weekly" ? r.payload.periodKey.slice(5) : r.payload.periodKey}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted">{r.payload.periodLabel}</span>
            <span className="flex-none font-mono text-[11px] text-muted">{timelineNote(r.payload, data.todayISO)}</span>
          </Link>
        ))}
      </Panel>
    </main>
  );
}
