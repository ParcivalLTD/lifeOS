"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { addHabitAction, toggleHabitAction } from "@/app/habits/actions";
import { CheckButton } from "@/components/check-button";
import { Panel } from "@/components/panel";
import { toISODate } from "@/lib/dates";
import { DOMAIN_DOT_CLASS, DOMAINS } from "@/lib/domains";
import type { HabitItem } from "@/lib/data/habits";

const inputCls =
  "border border-border-input bg-subtle px-2.5 py-2 text-[12.5px]";
const selectCls = "border border-border-input bg-subtle px-1.5 py-2 text-[12px]";

const DAY_CHIPS = [
  { key: "mon", label: "M" },
  { key: "tue", label: "T" },
  { key: "wed", label: "W" },
  { key: "thu", label: "T" },
  { key: "fri", label: "F" },
  { key: "sat", label: "S" },
  { key: "sun", label: "S" },
] as const;

type Patch = { id: string; done: boolean };

export function HabitsPanel({
  initialHabits,
  adherence7,
}: {
  initialHabits: HabitItem[];
  adherence7: number;
}) {
  const [, startTransition] = useTransition();
  const [habits, patch] = useOptimistic(
    initialHabits,
    (state: HabitItem[], p: Patch) =>
      state.map((h) =>
        h.id === p.id
          ? {
              ...h,
              doneToday: p.done,
              streak: Math.max(0, h.streak + (p.done ? 1 : -1)),
            }
          : h,
      ),
  );

  const { doneToday, scheduledToday } = useMemo(
    () => ({
      doneToday: habits.filter((h) => h.doneToday).length,
      scheduledToday: habits.filter((h) => h.scheduledToday).length,
    }),
    [habits],
  );

  const toggle = (h: HabitItem) => {
    const done = !h.doneToday;
    startTransition(async () => {
      patch({ id: h.id, done });
      await toggleHabitAction(h.id, toISODate(new Date()), done);
    });
  };

  return (
    <Panel
      label="Habits"
      value={`${doneToday} / ${scheduledToday} today`}
      footer={
        <>
          <div className="border-t border-border-row px-3 py-2 font-mono text-[10px] tracking-[.06em] text-faint">
            7-DAY ADHERENCE {adherence7}%
          </div>
          <AddHabitForm />
        </>
      }
    >
      {habits.length === 0 && (
        <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
          No habits — add one below
        </p>
      )}
      {habits.map((h) => (
        <div
          key={h.id}
          className="flex items-baseline gap-2.5 border-b border-border-row px-3 py-2"
        >
          <CheckButton
            checked={h.doneToday}
            label={h.doneToday ? `Untick "${h.title}"` : `Tick "${h.title}"`}
            onToggle={() => toggle(h)}
          />
          <div className={`min-w-0 flex-1 ${h.doneToday ? "opacity-50" : ""}`}>
            <div className="text-[12.5px]">{h.title}</div>
            <div className="flex flex-wrap items-baseline gap-x-1.5 font-mono text-[10px] uppercase tracking-[.04em] text-faint">
              <span className={`inline-block h-[7px] w-[7px] self-center ${DOMAIN_DOT_CLASS[h.domain]}`} />
              <span>{h.scheduleLabel}</span>
              {!h.scheduledToday && <span>· NOT SCHEDULED TODAY</span>}
              <span>· 7D {h.adherence7}%</span>
            </div>
          </div>
          <span className="flex-none font-mono text-[11px] text-muted">
            ×{h.streak}
          </span>
        </div>
      ))}
    </Panel>
  );
}

function AddHabitForm() {
  const [scheduleType, setScheduleType] = useState("daily");
  const [days, setDays] = useState<string[]>([]);

  const toggleDay = (key: string) =>
    setDays((d) => (d.includes(key) ? d.filter((x) => x !== key) : [...d, key]));

  return (
    <form
      action={addHabitAction}
      className="flex flex-wrap items-stretch gap-1.5 border-t border-border-header p-3"
    >
      <input
        name="title"
        required
        placeholder="Add a habit…"
        aria-label="Habit title"
        autoComplete="off"
        className={`${inputCls} min-w-0 flex-[2_1_180px]`}
      />
      <select name="domain" defaultValue="personal" aria-label="Domain" className={`${selectCls} flex-[1_0_98px]`}>
        {DOMAINS.map((d) => (
          <option key={d} value={d}>
            {d.toUpperCase()}
          </option>
        ))}
      </select>
      <select
        name="scheduleType"
        value={scheduleType}
        onChange={(e) => setScheduleType(e.target.value)}
        aria-label="Schedule"
        className={selectCls}
      >
        <option value="daily">DAILY</option>
        <option value="days">DAYS…</option>
        <option value="times">N×/WEEK</option>
      </select>
      {scheduleType === "days" && (
        <span className="flex items-stretch gap-1">
          <input type="hidden" name="days" value={days.join(",")} />
          {DAY_CHIPS.map((d) => {
            const selected = days.includes(d.key);
            return (
              <button
                key={d.key}
                type="button"
                aria-pressed={selected}
                aria-label={d.key}
                onClick={() => toggleDay(d.key)}
                className={`w-[30px] cursor-pointer border-[1.5px] border-ink font-mono text-[11px] font-semibold ${
                  selected ? "bg-ink text-[#ffffff]" : "bg-surface text-ink"
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </span>
      )}
      {scheduleType === "times" && (
        <input
          type="number"
          name="times"
          min={1}
          max={7}
          defaultValue={3}
          aria-label="Times per week"
          inputMode="numeric"
          className={`${selectCls} w-[64px] font-mono`}
        />
      )}
      <button
        type="submit"
        className="cursor-pointer border-0 bg-ink px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#ffffff]"
      >
        Add
      </button>
    </form>
  );
}
