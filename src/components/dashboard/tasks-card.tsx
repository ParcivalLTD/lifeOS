"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { setTaskStatusAction } from "@/app/tasks/actions";
import { CheckButton } from "@/components/check-button";
import { Panel } from "@/components/panel";
import { dueLabel } from "@/lib/dates";
import { DOMAIN_DOT_CLASS } from "@/lib/domains";
import { nextDueISO } from "@/lib/recurrence";
import type { TaskItem } from "@/lib/task-utils";

/** Top-3 tasks (FR-DASH.1), completable inline (FR-DASH.2). */
export function TasksCard({
  tasks: initialTasks,
  openCount,
  today,
}: {
  tasks: TaskItem[];
  openCount: number;
  today: string;
}) {
  const [, startTransition] = useTransition();
  const [tasks, patch] = useOptimistic(
    initialTasks,
    (
      state: TaskItem[],
      p: { id: string; status: TaskItem["status"]; dueDate?: string | null },
    ) =>
      state.map((t) =>
        t.id === p.id
          ? { ...t, status: p.status, ...(p.dueDate !== undefined ? { dueDate: p.dueDate } : {}) }
          : t,
      ),
  );

  // Recurring completion rolls forward in place (see TasksPanel); others toggle.
  const toggle = (t: TaskItem) => {
    const goingDone = t.status !== "done";
    startTransition(async () => {
      if (goingDone && t.recurrence) {
        const from = t.dueDate && t.dueDate > today ? t.dueDate : today;
        patch({ id: t.id, status: "open", dueDate: nextDueISO(t.recurrence, from) ?? t.dueDate });
      } else {
        patch({ id: t.id, status: goingDone ? "done" : "open" });
      }
      await setTaskStatusAction(t.id, goingDone ? "done" : "open");
    });
  };

  return (
    <Panel
      label="Tasks"
      value={`${openCount} open`}
      footer={
        <Link
          href="/tasks"
          className="block border-t border-border-header bg-subtle px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] no-underline"
        >
          All tasks →
        </Link>
      }
    >
      {tasks.length === 0 && (
        <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
          Nothing open — add tasks from the Tasks tab
        </p>
      )}
      {tasks.map((t) => {
        const done = t.status === "done";
        const due = t.dueDate ? dueLabel(t.dueDate, today) : null;
        return (
          <div
            key={t.id}
            className="flex items-baseline gap-2.5 border-b border-border-row px-3 py-2"
          >
            <CheckButton
              checked={done}
              label={done ? `Reopen "${t.title}"` : `Complete "${t.title}"`}
              onToggle={() => toggle(t)}
            />
            <div className={`min-w-0 flex-1 ${done ? "opacity-50" : ""}`}>
              <div className={`text-[12.5px] ${done ? "line-through" : ""}`}>
                {t.title}
              </div>
              <div className="flex flex-wrap items-baseline gap-x-1.5 font-mono text-[10px] uppercase tracking-[.04em] text-faint">
                <span
                  className={`inline-block h-[7px] w-[7px] self-center ${DOMAIN_DOT_CLASS[t.domain]}`}
                />
                <span>{t.domain}</span>
                {due && (
                  <span className={due.overdue && !done ? "text-status-bad" : ""}>
                    · {due.text}
                  </span>
                )}
              </div>
            </div>
            <span className="flex-none border border-border-outer px-[5px] py-px font-mono text-[10px] font-semibold text-muted">
              P{t.priority}
            </span>
          </div>
        );
      })}
    </Panel>
  );
}
