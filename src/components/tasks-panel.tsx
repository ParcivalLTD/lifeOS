"use client";

import { useMemo, useOptimistic, useTransition } from "react";
import { addTaskAction, setTaskStatusAction } from "@/app/tasks/actions";
import { CheckButton } from "@/components/check-button";
import { Panel } from "@/components/panel";
import { dueLabel } from "@/lib/dates";
import { DOMAIN_DOT_CLASS, DOMAINS, isDomain } from "@/lib/domains";
import { recurrenceLabel } from "@/lib/recurrence";
import type { TaskItem, TaskStatus } from "@/lib/task-utils";

const inputCls =
  "border border-border-input bg-subtle px-2.5 py-2 text-[12.5px]";
const selectCls = "border border-border-input bg-subtle px-1.5 py-2 text-[12px]";

type Patch =
  | { type: "add"; item: TaskItem }
  | { type: "status"; id: string; status: TaskStatus };

export function TasksPanel({
  initialTasks,
  today,
}: {
  initialTasks: TaskItem[];
  today: string;
}) {
  const [, startTransition] = useTransition();
  const [tasks, patch] = useOptimistic(
    initialTasks,
    (state: TaskItem[], p: Patch) =>
      p.type === "add"
        ? [...state, p.item]
        : state.map((t) => (t.id === p.id ? { ...t, status: p.status } : t)),
  );

  const openCount = useMemo(
    () => tasks.filter((t) => t.status === "open").length,
    [tasks],
  );

  const setStatus = (id: string, status: TaskStatus) => {
    startTransition(async () => {
      patch({ type: "status", id, status });
      await setTaskStatusAction(id, status);
    });
  };

  const add = async (formData: FormData) => {
    const title = String(formData.get("title") ?? "").trim();
    if (!title) return;
    const domainRaw = String(formData.get("domain") ?? "personal");
    const dueRaw = String(formData.get("due") ?? "");
    patch({
      type: "add",
      item: {
        id: `optimistic-${Date.now()}`,
        title,
        domain: isDomain(domainRaw) ? domainRaw : "personal",
        dueDate: dueRaw || null,
        priority: Number(formData.get("priority")) || 2,
        status: "open",
        recurrence: null,
      },
    });
    await addTaskAction(formData);
  };

  return (
    <Panel
      label="Tasks"
      value={`${openCount} open`}
      footer={
        <form
          action={add}
          className="flex flex-wrap items-stretch gap-1.5 border-t border-border-header p-3"
        >
          <input
            name="title"
            required
            placeholder="Add a task…"
            aria-label="Task title"
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
          <input
            type="date"
            name="due"
            aria-label="Due date"
            className={`${selectCls} flex-[1_0_130px] font-mono`}
          />
          <select name="priority" defaultValue="2" aria-label="Priority" className={selectCls}>
            <option value="1">P1</option>
            <option value="2">P2</option>
            <option value="3">P3</option>
          </select>
          <select name="repeat" defaultValue="" aria-label="Repeat" className={selectCls}>
            <option value="">NO REPEAT</option>
            <option value="daily">DAILY</option>
            <option value="weekly">WEEKLY</option>
            <option value="monthly">MONTHLY</option>
            <option value="yearly">YEARLY</option>
          </select>
          <button
            type="submit"
            className="cursor-pointer border-0 bg-ink px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#ffffff]"
          >
            Add
          </button>
        </form>
      }
    >
      {tasks.length === 0 && (
        <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
          No tasks — add one below
        </p>
      )}
      {tasks.map((t) => {
        const settled = t.status !== "open";
        const due = t.dueDate ? dueLabel(t.dueDate, today) : null;
        const repeat = recurrenceLabel(t.recurrence);
        return (
          <div
            key={t.id}
            className="flex items-baseline gap-2.5 border-b border-border-row px-3 py-2"
          >
            <CheckButton
              checked={t.status === "done"}
              label={t.status === "done" ? `Reopen "${t.title}"` : `Complete "${t.title}"`}
              onToggle={() => setStatus(t.id, t.status === "open" ? "done" : "open")}
            />
            <div className={`min-w-0 flex-1 ${settled ? "opacity-50" : ""}`}>
              <div
                className={`text-[12.5px] ${settled ? "line-through" : ""}`}
              >
                {t.title}
              </div>
              <div className="flex flex-wrap items-baseline gap-x-1.5 font-mono text-[10px] uppercase tracking-[.04em] text-faint">
                <span className={`inline-block h-[7px] w-[7px] self-center ${DOMAIN_DOT_CLASS[t.domain]}`} />
                <span>{t.domain}</span>
                {t.status === "dropped" && <span>· DROPPED</span>}
                {due && (
                  <span className={due.overdue && t.status === "open" ? "text-status-bad" : ""}>
                    · {due.text}
                  </span>
                )}
                {repeat && <span>· ↻ {repeat}</span>}
              </div>
            </div>
            <span className="flex-none border border-border-outer px-[5px] py-px font-mono text-[10px] font-semibold text-muted">
              P{t.priority}
            </span>
            {t.status === "open" ? (
              <button
                type="button"
                aria-label={`Drop "${t.title}"`}
                onClick={() => setStatus(t.id, "dropped")}
                className="-m-1.5 flex-none cursor-pointer border-0 bg-transparent p-1.5 font-mono text-[11px] leading-none text-faintest"
              >
                ✕
              </button>
            ) : (
              <span className="w-[14px] flex-none" />
            )}
          </div>
        );
      })}
    </Panel>
  );
}
