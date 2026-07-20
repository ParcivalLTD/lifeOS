"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { generateDailyNudgeAction } from "@/app/nudge/actions";

/**
 * Assistant daily nudge (FR-AI.3) — inverted banner per the mockup.
 *
 * Advisory only (FR-AI.4): this shows a data-grounded line and never writes.
 * Acting on it means tapping "Discuss →" into the chat, where the
 * propose→approve card lives.
 *
 * Cost (NFR-5): the dashboard passes the CACHED nudge (read server-side, no
 * API). Only when the day has no cached nudge yet does this fire the generate
 * action once — client-side after render, so the dashboard stays fast. The
 * action itself caches, so the API is hit at most once per day even across
 * remounts. The module-level guards keep a single browser session from
 * re-firing as the user swipes tabs.
 */
let attemptedForDate: string | null = null;
let sessionText: string | null = null;
let inFlight = false;

export function NudgeBanner({
  today,
  nudge,
  enabled,
  configured,
}: {
  today: string;
  nudge: string | null;
  enabled: boolean;
  configured: boolean;
}) {
  const sessionCached = attemptedForDate === today ? sessionText : null;
  // decided at render so `loading` can be an initial value, not a synchronous
  // setState inside the effect (which the react-hooks rule disallows)
  const willGenerate = enabled && configured && !nudge && !sessionCached && attemptedForDate !== today;

  const [text, setText] = useState<string | null>(nudge ?? sessionCached);
  const [loading, setLoading] = useState(willGenerate || (inFlight && !nudge && !sessionCached));

  useEffect(() => {
    if (!willGenerate) return;
    attemptedForDate = today;
    inFlight = true;
    generateDailyNudgeAction()
      .then((res) => {
        if (res.ok) {
          sessionText = res.text;
          setText(res.text);
        }
      })
      .catch(() => {})
      .finally(() => {
        inFlight = false;
        setLoading(false);
      });
  }, [willGenerate, today]);

  if (!enabled) return null;

  const shell = (children: React.ReactNode) => (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 bg-ink px-3.5 py-2.5 text-inverse">
      <span className="flex-none font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faintest">
        Helm
      </span>
      {children}
    </div>
  );

  if (text) {
    return shell(
      <>
        <span className="min-w-[260px] flex-1 text-[12.5px]">{text}</span>
        <Link
          href="/assistant"
          className="flex-none font-mono text-[10px] font-semibold uppercase tracking-[.06em] text-faintest underline underline-offset-2"
        >
          Discuss →
        </Link>
      </>,
    );
  }

  if (loading) {
    return shell(
      <span className="min-w-[260px] flex-1 font-mono text-[11px] uppercase tracking-[.04em] text-faintest">
        Reading your week…
      </span>,
    );
  }

  if (!configured) {
    return shell(
      <>
        <span className="min-w-[260px] flex-1 text-[12.5px]">
          Set an API key to get one short, data-grounded nudge here each day.
        </span>
        <Link
          href="/settings/ai-preview"
          className="flex-none font-mono text-[10px] font-semibold uppercase tracking-[.06em] text-faintest underline underline-offset-2"
        >
          Preview →
        </Link>
      </>,
    );
  }

  // enabled + configured, but generation produced nothing this session — stay
  // quiet rather than showing an error on the dashboard
  return null;
}
