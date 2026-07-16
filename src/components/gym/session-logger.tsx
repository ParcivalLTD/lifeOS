"use client";

import { useOptimistic, useState, useTransition } from "react";
import { addSetAction, logSetAction } from "@/app/gym/actions";
import { CheckButton } from "@/components/check-button";
import { Panel } from "@/components/panel";
import type { GymSetLog } from "@/db/schema";
import { sessionSetCounts, targetLabel, type SessionExercise } from "@/lib/gym";

type SetPatch = { exIdx: number; setIdx: number; patch: Partial<GymSetLog> };

const numCls =
  "w-[52px] border border-border-input bg-subtle px-1.5 py-1 text-center font-mono text-[12px]";

/**
 * Session logger (FR-GYM.2). Capture is sacred: a set is pre-filled from last
 * session, so logging it is a single tap on the check (optimistic, sub-10s,
 * one-handed). Weight/reps stay editable and commit on blur.
 */
export function SessionLogger({
  sessionId,
  name,
  dateLabel,
  exercises: initial,
  lastByExercise,
}: {
  sessionId: string;
  name: string;
  dateLabel: string;
  exercises: SessionExercise[];
  lastByExercise: Record<string, string | null>;
}) {
  const [, startTransition] = useTransition();
  const [exercises, applyPatch] = useOptimistic(
    initial,
    (state: SessionExercise[], p: SetPatch) =>
      state.map((ex, i) =>
        i !== p.exIdx
          ? ex
          : {
              ...ex,
              sets: ex.sets.map((s, j) => (j !== p.setIdx ? s : { ...s, ...p.patch })),
            },
      ),
  );

  const { done, total } = sessionSetCounts(exercises);

  const commit = (exIdx: number, setIdx: number, patch: Partial<GymSetLog>) => {
    startTransition(async () => {
      applyPatch({ exIdx, setIdx, patch });
      await logSetAction(sessionId, exIdx, setIdx, patch);
    });
  };

  const addSet = (exIdx: number) => {
    const last = exercises[exIdx].sets.at(-1);
    startTransition(async () => {
      applyPatch({
        exIdx,
        setIdx: exercises[exIdx].sets.length,
        patch: {}, // optimistic count bump happens via server revalidation
      });
      void last;
      await addSetAction(sessionId, exIdx);
    });
  };

  return (
    <Panel
      label={`Session — ${name}`}
      value={dateLabel}
      footer={
        <div className="px-3 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-muted">
          {done} of {total} sets logged
        </div>
      }
    >
      {exercises.map((ex, exIdx) => {
        const last = lastByExercise[ex.name];
        return (
          <div key={`${ex.name}-${exIdx}`} className="border-b border-border-row pb-1.5">
            <div className="flex items-baseline justify-between px-3 pt-2.5">
              <span className="text-[12.5px] font-semibold">{ex.name}</span>
              <span className="font-mono text-[10px] text-muted">{targetLabel(ex)}</span>
            </div>
            <div className="px-3 pb-1 font-mono text-[10px] uppercase tracking-[.03em] text-faint">
              LAST: {last ?? "—"}
            </div>
            {ex.sets.map((s, setIdx) => (
              <SetRow
                key={setIdx}
                index={setIdx + 1}
                set={s}
                onToggle={() => commit(exIdx, setIdx, { done: !s.done })}
                onKg={(kg) => commit(exIdx, setIdx, { kg })}
                onReps={(reps) => commit(exIdx, setIdx, { reps })}
                label={`${s.done ? "Uncheck" : "Log"} ${ex.name} set ${setIdx + 1}`}
              />
            ))}
            <button
              type="button"
              onClick={() => addSet(exIdx)}
              className="mt-0.5 ml-3 cursor-pointer border-0 bg-transparent p-0 font-mono text-[10px] uppercase tracking-[.06em] text-faint underline underline-offset-2"
            >
              + set
            </button>
          </div>
        );
      })}
    </Panel>
  );
}

function SetRow({
  index,
  set,
  onToggle,
  onKg,
  onReps,
  label,
}: {
  index: number;
  set: GymSetLog;
  onToggle: () => void;
  onKg: (kg: number) => void;
  onReps: (reps: number) => void;
  label: string;
}) {
  const [kg, setKg] = useState(String(set.kg));
  const [reps, setReps] = useState(String(set.reps));

  const commitKg = () => {
    const n = Number(kg);
    if (Number.isFinite(n) && n !== set.kg) onKg(n);
  };
  const commitReps = () => {
    const n = Math.round(Number(reps));
    if (Number.isFinite(n) && n !== set.reps) onReps(n);
  };

  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-1 ${set.done ? "opacity-60" : ""}`}
    >
      <span className="w-[42px] flex-none font-mono text-[10px] uppercase text-faint">
        Set {index}
      </span>
      <input
        value={kg}
        inputMode="decimal"
        aria-label={`${label} weight`}
        onChange={(e) => setKg(e.target.value)}
        onBlur={commitKg}
        className={numCls}
      />
      <span className="font-mono text-[11px] text-faint">kg ×</span>
      <input
        value={reps}
        inputMode="numeric"
        aria-label={`${label} reps`}
        onChange={(e) => setReps(e.target.value)}
        onBlur={commitReps}
        className={`${numCls} w-[44px]`}
      />
      <div className="flex-1" />
      <CheckButton checked={Boolean(set.done)} onToggle={onToggle} label={label} size={20} />
    </div>
  );
}
