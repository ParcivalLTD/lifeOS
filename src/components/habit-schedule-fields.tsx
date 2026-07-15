"use client";

import { useState } from "react";

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

/**
 * Schedule selector shared by the add form and the edit page: type select
 * plus day chips / times input revealed per type. When `keepLabel` is set
 * (edit page), a "__keep" option preserves the stored schedule untouched.
 */
export function HabitScheduleFields({
  keepLabel,
  defaultDays = [],
  defaultTimes = 3,
}: {
  keepLabel?: string;
  defaultDays?: string[];
  defaultTimes?: number;
}) {
  const [scheduleType, setScheduleType] = useState(keepLabel ? "__keep" : "daily");
  const [days, setDays] = useState<string[]>(defaultDays);

  const toggleDay = (key: string) =>
    setDays((d) => (d.includes(key) ? d.filter((x) => x !== key) : [...d, key]));

  return (
    <>
      <select
        name="scheduleType"
        value={scheduleType}
        onChange={(e) => setScheduleType(e.target.value)}
        aria-label="Schedule"
        className={selectCls}
      >
        {keepLabel && <option value="__keep">KEEP ({keepLabel})</option>}
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
          defaultValue={defaultTimes}
          aria-label="Times per week"
          inputMode="numeric"
          className={`${selectCls} w-[64px] font-mono`}
        />
      )}
    </>
  );
}
