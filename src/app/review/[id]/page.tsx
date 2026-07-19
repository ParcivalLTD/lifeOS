import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Panel } from "@/components/panel";
import { requireUser } from "@/lib/auth";
import { getReview } from "@/lib/data/review";
import { DOMAIN_DOT_CLASS, isDomain } from "@/lib/domains";
import { REVIEW_TYPE_LABEL } from "@/lib/review";

export const metadata: Metadata = { title: "LIFEOS — REVIEW" };

const labelCls = "font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faint";

const REFLECTION_LABEL: Record<string, string> = {
  worked: "What worked?",
  didnt: "What didn't, and why?",
  top3: "Top 3 for next week",
  moved: "What moved?",
  adjust: "Adjust or abandon — decisions",
};

const FLAG_LABEL: Record<string, string> = {
  "on-track": "ON TRACK",
  "at-risk": "AT RISK",
  overdue: "OVERDUE",
  "no-signal": "NO SIGNAL",
};

/** A stored review is a point-in-time snapshot — rendered as saved, never
 * recomputed (FR-REV.3). */
export default async function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const review = await getReview(user.id, id);
  if (!review) notFound();
  const p = review.payload;

  return (
    <>
      <AppHeader />
      <main className="mx-auto flex w-full max-w-[860px] flex-col gap-3 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className={labelCls}>
            {REVIEW_TYPE_LABEL[p.rev]} review — {p.periodLabel}
          </span>
          <span className="font-mono text-[10px] text-faint">SNAPSHOT SAVED {p.savedISO}</span>
        </div>

        {p.stats && (
          <Panel label="Summary — as computed at review time">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))]">
              {p.stats.map((s) => (
                <div key={s.l} className="-mb-px border-r border-b border-border-row px-3 py-2.5">
                  <div className="font-mono text-[17px] font-semibold">{s.v}</div>
                  <div className="mt-0.5 font-mono text-[9px] font-semibold uppercase tracking-[.07em] text-faint">{s.l}</div>
                </div>
              ))}
            </div>
            <div className="px-3 py-2">
              {p.stats.map((s) => (
                <div key={s.l} className="py-0.5 font-mono text-[9px] uppercase tracking-[.03em] text-faint">
                  {s.l}: {s.basis}
                </div>
              ))}
            </div>
          </Panel>
        )}

        {p.highlights && p.highlights.length > 0 && (
          <Panel label="Highlights">
            {p.highlights.map((h) => (
              <div key={h} className="flex gap-2 border-b border-border-row px-3 py-1.5 text-[12.5px]">
                <span className="font-mono text-[11px] text-faint">—</span>
                {h}
              </div>
            ))}
          </Panel>
        )}

        {p.goals && p.goals.length > 0 && (
          <Panel label="Goals — as reviewed" value={`${p.goals.filter((g) => g.flag !== "on-track").length} flagged`}>
            {p.goals.map((g) => (
              <div key={g.id} className="border-b border-border-row px-3 py-2">
                <div className="flex items-baseline gap-2.5">
                  {isDomain(g.domain) && (
                    <span className={`h-[7px] w-[7px] flex-none self-center ${DOMAIN_DOT_CLASS[g.domain]}`} />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{g.title}</span>
                  <span className="font-mono text-[11px] text-muted">{g.pct}%</span>
                  <span className="flex-none border border-border-input px-[5px] py-px font-mono text-[9px] font-semibold tracking-[.07em] text-muted">
                    {FLAG_LABEL[g.flag] ?? g.flag.toUpperCase()}
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[.03em] text-faint">{g.flagBasis}</div>
              </div>
            ))}
          </Panel>
        )}

        <Panel label="Reflections">
          {Object.entries(p.reflections).length === 0 && (
            <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
              None written for this period
            </p>
          )}
          {Object.entries(p.reflections).map(([k, v]) => (
            <div key={k} className="border-b border-border-row px-3 py-2">
              <div className={`${labelCls} mb-1`}>{REFLECTION_LABEL[k] ?? k}</div>
              <div className="text-[12.5px] whitespace-pre-wrap">{v}</div>
            </div>
          ))}
        </Panel>

        <Link href="/review" className="font-mono text-[10px] uppercase tracking-[.06em] text-faint">
          ← Back to reviews
        </Link>
      </main>
    </>
  );
}
