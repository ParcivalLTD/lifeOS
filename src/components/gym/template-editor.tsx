"use client";

import Link from "next/link";
import { useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { Panel } from "@/components/panel";
import type { TemplateExercise } from "@/lib/gym";

const inputCls = "border border-border-input bg-subtle px-2.5 py-2 text-[12.5px]";
const numCls = "w-[56px] border border-border-input bg-subtle px-1.5 py-2 text-center font-mono text-[12px]";
const labelCls = "font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faint";

type Row = { name: string; targetSets: string; targetReps: string; targetKg: string };

const toRow = (e: TemplateExercise): Row => ({
  name: e.name,
  targetSets: String(e.targetSets),
  targetReps: String(e.targetReps),
  targetKg: e.targetKg != null ? String(e.targetKg) : "",
});

const blankRow = (): Row => ({ name: "", targetSets: "3", targetReps: "8", targetKg: "" });

/**
 * Create/edit a workout template (FR-GYM.1). Exercise rows are managed
 * client-side and serialized into a hidden JSON field the server action
 * parses and validates.
 */
export function TemplateEditor({
  action,
  deleteAction,
  id,
  initialName = "",
  initialExercises,
}: {
  action: (formData: FormData) => void | Promise<void>;
  deleteAction?: (formData: FormData) => void | Promise<void>;
  id?: string;
  initialName?: string;
  initialExercises?: TemplateExercise[];
}) {
  const [name, setName] = useState(initialName);
  const [rows, setRows] = useState<Row[]>(
    initialExercises?.length ? initialExercises.map(toRow) : [blankRow()],
  );

  const update = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const remove = (i: number) => setRows((r) => (r.length > 1 ? r.filter((_, j) => j !== i) : r));

  const exercisesJson = JSON.stringify(
    rows
      .filter((r) => r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        targetSets: Number(r.targetSets) || 3,
        targetReps: Number(r.targetReps) || 8,
        targetKg: r.targetKg.trim() === "" ? undefined : Number(r.targetKg),
      })),
  );
  const valid = name.trim().length > 0 && rows.some((r) => r.name.trim());

  return (
    <Panel label={id ? "Template — edit" : "New template"}>
      <form action={action} className="flex flex-col gap-3 p-4">
        {id && <input type="hidden" name="id" value={id} />}
        <input type="hidden" name="exercises" value={exercisesJson} />

        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Name</span>
          <input
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Upper A"
            className={inputCls}
          />
        </label>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <span className={`${labelCls} flex-1`}>Exercise</span>
            <span className={`${labelCls} w-[56px] text-center`}>Sets</span>
            <span className={`${labelCls} w-[56px] text-center`}>Reps</span>
            <span className={`${labelCls} w-[56px] text-center`}>KG</span>
            <span className="w-[16px]" />
          </div>
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                aria-label={`Exercise ${i + 1} name`}
                value={row.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="Bench Press"
                className={`${inputCls} min-w-0 flex-1`}
              />
              <input aria-label={`Exercise ${i + 1} sets`} inputMode="numeric" value={row.targetSets} onChange={(e) => update(i, { targetSets: e.target.value })} className={numCls} />
              <input aria-label={`Exercise ${i + 1} reps`} inputMode="numeric" value={row.targetReps} onChange={(e) => update(i, { targetReps: e.target.value })} className={numCls} />
              <input aria-label={`Exercise ${i + 1} target kg`} inputMode="decimal" value={row.targetKg} onChange={(e) => update(i, { targetKg: e.target.value })} placeholder="—" className={numCls} />
              <button
                type="button"
                aria-label={`Remove exercise ${i + 1}`}
                onClick={() => remove(i)}
                className="w-[16px] flex-none cursor-pointer border-0 bg-transparent p-0 font-mono text-[12px] text-faintest"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRows((r) => [...r, blankRow()])}
            className="self-start cursor-pointer border-0 bg-transparent p-0 font-mono text-[10px] uppercase tracking-[.06em] text-faint underline underline-offset-2"
          >
            + exercise
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={!valid}
            className="cursor-pointer border-0 bg-ink px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#ffffff] disabled:opacity-40"
          >
            Save
          </button>
          {id && deleteAction && (
            <ConfirmButton label="Delete" confirmLabel="Confirm delete?" formAction={deleteAction} />
          )}
          <Link href="/gym" className="px-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
            Cancel
          </Link>
        </div>
      </form>
    </Panel>
  );
}
