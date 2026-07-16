"use client";

import Link from "next/link";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { addHabitAction, toggleHabitAction } from "@/app/habits/actions";
import { CheckButton } from "@/components/check-button";
import { FilterBar, FilterSelect, FilterToggle } from "@/components/filter-bar";
import { HabitScheduleFields } from "@/components/habit-schedule-fields";
import { Panel } from "@/components/panel";
import { toISODate } from "@/lib/dates";
import { DOMAIN_DOT_CLASS, DOMAINS, isDomain } from "@/lib/domains";
import { isScheduledOn, scheduleLabel } from "@/lib/habits";
import type { HabitSchedule } from "@/db/schema";
import type { HabitItem } from "@/lib/data/habits";
import {
  filterHabits,
  habitFilterActive,
  type HabitFilter,
} from "@/lib/list-filters";

const inputCls =
  "border border-border-input bg-subtle px-2.5 py-2 text-[12.5px]";
const selectCls = "border border-border-input bg-subtle px-1.5 py-2 text-[12px]";

type Patch = { type: "toggle"; id: string; done: boolean } | { type: "add"; item: HabitItem };

/** Optimistic HabitItem from the add-form's fields (server recomputes stats). */
function optimisticHabit(formData: FormData): HabitItem | null {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return null;
  const domainRaw = String(formData.get("domain") ?? "personal");
  const type = String(formData.get("scheduleType") ?? "daily");
  let schedule: HabitSchedule = { type: "daily" };
  if (type === "days") {
    const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
    const days = String(formData.get("days") ?? "")
      .split(",")
      .filter((d): d is (typeof DAY_KEYS)[number] =>
        (DAY_KEYS as readonly string[]).includes(d),
      );
    if (!days.length) return null;
    schedule = { type: "weekly_days", days };
  } else if (type === "times") {
    schedule = { type: "times_per_week", times: Math.min(7, Math.max(1, Number(formData.get("times")) || 3)) };
  }
  const today = toISODate(new Date());
  return {
    id: `optimistic-${Date.now()}`,
    title,
    domain: isDomain(domainRaw) ? domainRaw : "personal",
    schedule,
    scheduleLabel: scheduleLabel(schedule),
    scheduledToday: isScheduledOn(schedule, today),
    doneToday: false,
    streak: 0,
    adherence7: 0,
  };
}

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
    (state: HabitItem[], p: Patch) => {
      if (p.type === "add") return [...state, p.item];
      return state.map((h) =>
        h.id === p.id
          ? {
              ...h,
              doneToday: p.done,
              streak: Math.max(0, h.streak + (p.done ? 1 : -1)),
            }
          : h,
      );
    },
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
      patch({ type: "toggle", id: h.id, done });
      await toggleHabitAction(h.id, toISODate(new Date()), done);
    });
  };

  const add = async (formData: FormData) => {
    const item = optimisticHabit(formData);
    if (item) patch({ type: "add", item });
    await addHabitAction(formData);
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
          <AddHabitForm action={add} />
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
      {visible.map((h) => {
        const body = (
          <>
            <div className="text-[12.5px]">{h.title}</div>
            <div className="flex flex-wrap items-baseline gap-x-1.5 font-mono text-[10px] uppercase tracking-[.04em] text-faint">
              <span className={`inline-block h-[7px] w-[7px] self-center ${DOMAIN_DOT_CLASS[h.domain]}`} />
              <span>{h.scheduleLabel}</span>
              {!h.scheduledToday && <span>· NOT SCHEDULED TODAY</span>}
              <span>· 7D {h.adherence7}%</span>
            </div>
          </>
        );
        const bodyCls = `min-w-0 flex-1 no-underline ${h.doneToday ? "opacity-50" : ""}`;
        return (
          <div
            key={h.id}
            className="flex items-baseline gap-2.5 border-b border-border-row px-3 py-2"
          >
            <CheckButton
              checked={h.doneToday}
              label={h.doneToday ? `Untick "${h.title}"` : `Tick "${h.title}"`}
              onToggle={() => toggle(h)}
            />
            {h.id.startsWith("optimistic-") ? (
              <div className={bodyCls}>{body}</div>
            ) : (
              <Link href={`/habits/${h.id}`} className={bodyCls}>
                {body}
              </Link>
            )}
            <span className="flex-none font-mono text-[11px] text-muted">
              ×{h.streak}
            </span>
          </div>
        );
      })}
    </Panel>
  );
}

function AddHabitForm({
  action,
}: {
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form
      action={action}
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
