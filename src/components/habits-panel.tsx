"use client";

import Link from "next/link";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { addHabitAction, toggleHabitAction } from "@/app/habits/actions";
import { CheckButton } from "@/components/check-button";
import { FilterBar, FilterSelect, FilterToggle } from "@/components/filter-bar";
import { HabitScheduleFields } from "@/components/habit-schedule-fields";
import { Panel } from "@/components/panel";
import { toISODate } from "@/lib/dates";
import { DOMAIN_DOT_CLASS, DOMAINS } from "@/lib/domains";
import type { HabitItem } from "@/lib/data/habits";
import {
  filterHabits,
  habitFilterActive,
  type HabitFilter,
} from "@/lib/list-filters";

const inputCls =
  "border border-border-input bg-subtle px-2.5 py-2 text-[12.5px]";
const selectCls = "border border-border-input bg-subtle px-1.5 py-2 text-[12px]";

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

  const [hideDone, setHideDone] = useState(true);
  const [domain, setDomain] = useState<HabitFilter["domain"]>("all");
  const [scheduleType, setScheduleType] =
    useState<HabitFilter["scheduleType"]>("all");

  const filter: HabitFilter = useMemo(
    () => ({ hideDone, domain, scheduleType }),
    [hideDone, domain, scheduleType],
  );

  const { doneToday, scheduledToday } = useMemo(
    () => ({
      doneToday: habits.filter((h) => h.doneToday).length,
      scheduledToday: habits.filter((h) => h.scheduledToday).length,
    }),
    [habits],
  );
  const visible = useMemo(() => filterHabits(habits, filter), [habits, filter]);
  const active = habitFilterActive(filter);

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
      value={
        active
          ? `${visible.length} shown · ${doneToday}/${scheduledToday} today`
          : `${doneToday} / ${scheduledToday} today`
      }
      footer={
        <>
          <div className="border-t border-border-row px-3 py-2 font-mono text-[10px] tracking-[.06em] text-faint">
            7-DAY ADHERENCE {adherence7}%
          </div>
          <AddHabitForm />
        </>
      }
    >
      <FilterBar>
        <FilterToggle label="Hide done" checked={hideDone} onChange={setHideDone} />
        <FilterSelect
          label="Domain"
          value={domain}
          onChange={setDomain}
          options={[
            { value: "all", label: "ALL" },
            ...DOMAINS.map((d) => ({ value: d, label: d.toUpperCase() })),
          ]}
        />
        <FilterSelect
          label="Sched"
          value={scheduleType}
          onChange={setScheduleType}
          options={[
            { value: "all", label: "ALL" },
            { value: "daily", label: "DAILY" },
            { value: "weekly_days", label: "DAYS" },
            { value: "times_per_week", label: "N×/WK" },
          ]}
        />
      </FilterBar>

      {visible.length === 0 && (
        <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
          {habits.length === 0
            ? "No habits — add one below"
            : hideDone && doneToday > 0 && !active
              ? "All done for today ✓"
              : "No habits match the current filters"}
        </p>
      )}
      {visible.map((h) => (
        <div
          key={h.id}
          className="flex items-baseline gap-2.5 border-b border-border-row px-3 py-2"
        >
          <CheckButton
            checked={h.doneToday}
            label={h.doneToday ? `Untick "${h.title}"` : `Tick "${h.title}"`}
            onToggle={() => toggle(h)}
          />
          <Link
            href={`/habits/${h.id}`}
            className={`min-w-0 flex-1 no-underline ${h.doneToday ? "opacity-50" : ""}`}
          >
            <div className="text-[12.5px]">{h.title}</div>
            <div className="flex flex-wrap items-baseline gap-x-1.5 font-mono text-[10px] uppercase tracking-[.04em] text-faint">
              <span className={`inline-block h-[7px] w-[7px] self-center ${DOMAIN_DOT_CLASS[h.domain]}`} />
              <span>{h.scheduleLabel}</span>
              {!h.scheduledToday && <span>· NOT SCHEDULED TODAY</span>}
              <span>· 7D {h.adherence7}%</span>
            </div>
          </Link>
          <span className="flex-none font-mono text-[11px] text-muted">
            ×{h.streak}
          </span>
        </div>
      ))}
    </Panel>
  );
}

function AddHabitForm() {
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
      <HabitScheduleFields />
      <button
        type="submit"
        className="cursor-pointer border-0 bg-ink px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#ffffff]"
      >
        Add
      </button>
    </form>
  );
}
