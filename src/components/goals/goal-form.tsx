import Link from "next/link";
import { archiveGoalAction } from "@/app/goals/actions";
import { ConfirmButton } from "@/components/confirm-button";
import { Panel } from "@/components/panel";
import { DOMAINS } from "@/lib/domains";
import { HORIZONS, HORIZON_LABEL } from "@/lib/goals";

const inputCls = "border border-border-input bg-subtle px-2.5 py-2 text-[12.5px]";
const labelCls = "font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faint";

type Values = {
  id?: string;
  title?: string;
  description?: string | null;
  domain?: string;
  horizon?: string;
  parentGoalId?: string | null;
  targetDate?: string | null;
  successCriteria?: string | null;
  status?: string;
};

/** Create/edit a goal (FR-GOAL.1): outcome + horizon + parent (milestone nesting). */
export function GoalForm({
  action,
  values = {},
  parentOptions,
  defaultParentId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  values?: Values;
  parentOptions: { id: string; title: string; horizon: string }[];
  defaultParentId?: string;
}) {
  const parents = parentOptions.filter((p) => p.id !== values.id);
  return (
    <Panel label={values.id ? "Goal — edit" : "New goal"}>
      <form action={action} className="flex flex-col gap-3 p-4">
        {values.id && <input type="hidden" name="id" value={values.id} />}

        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Outcome</span>
          <input name="title" required defaultValue={values.title ?? ""} placeholder="e.g. Bench press 100 kg" className={inputCls} />
        </label>

        <div className="flex flex-wrap gap-1.5">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className={labelCls}>Domain</span>
            <select name="domain" defaultValue={values.domain ?? "personal"} className={inputCls}>
              {DOMAINS.map((d) => (
                <option key={d} value={d}>{d.toUpperCase()}</option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className={labelCls}>Horizon</span>
            <select name="horizon" defaultValue={values.horizon ?? "yearly"} className={inputCls}>
              {HORIZONS.map((h) => (
                <option key={h} value={h}>{HORIZON_LABEL[h]}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Parent goal (milestone of…)</span>
          <select name="parentGoalId" defaultValue={values.parentGoalId ?? defaultParentId ?? ""} className={inputCls}>
            <option value="">— none (top-level) —</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>[{HORIZON_LABEL[p.horizon as keyof typeof HORIZON_LABEL]}] {p.title}</option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-1.5">
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Target date</span>
            <input type="date" name="targetDate" defaultValue={values.targetDate ?? ""} className={`${inputCls} font-mono`} />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className={labelCls}>Status</span>
            <select name="status" defaultValue={values.status ?? "active"} className={inputCls}>
              <option value="active">ACTIVE</option>
              <option value="achieved">ACHIEVED</option>
              <option value="paused">PAUSED</option>
              <option value="abandoned">ABANDONED</option>
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Success criteria</span>
          <input name="successCriteria" defaultValue={values.successCriteria ?? ""} placeholder="How you'll know it's done (targets go here)" className={inputCls} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Notes</span>
          <textarea name="description" rows={2} defaultValue={values.description ?? ""} className={`${inputCls} resize-y`} />
        </label>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="submit" className="cursor-pointer border-0 bg-ink px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#ffffff]">Save</button>
          {values.id && <ConfirmButton label="Delete" confirmLabel="Confirm delete?" formAction={archiveGoalAction} />}
          <Link href={values.id ? `/goals/${values.id}` : "/goals"} className="px-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">Cancel</Link>
        </div>
      </form>
    </Panel>
  );
}
