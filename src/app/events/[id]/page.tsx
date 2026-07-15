import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteEventAction, updateEventAction } from "@/app/events/actions";
import { AppHeader } from "@/components/app-header";
import { Panel } from "@/components/panel";
import { requireUser } from "@/lib/auth";
import { getEvent } from "@/lib/data/events";
import { DOMAINS } from "@/lib/domains";
import { EVENT_KINDS, KIND_LABEL } from "@/lib/event-utils";

export const metadata: Metadata = { title: "LIFEOS — EVENT" };

const inputCls = "border border-border-input bg-subtle px-2.5 py-2 text-[12.5px]";
const labelCls =
  "font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faint";

export default async function EventEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const event = await getEvent(user.id, id);
  if (!event) notFound();

  return (
    <>
      <AppHeader active="calendar" />
      <main className="mx-auto w-full max-w-[560px] p-4">
        <Panel label="Event — edit" value={KIND_LABEL[event.kind]}>
          <form action={updateEventAction} className="flex flex-col gap-3 p-4">
            <input type="hidden" name="id" value={event.id} />

            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Title</span>
              <input
                name="title"
                required
                defaultValue={event.title}
                className={inputCls}
              />
            </label>

            <div className="flex flex-wrap gap-1.5">
              <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className={labelCls}>Domain</span>
                <select name="domain" defaultValue={event.domain} className={inputCls}>
                  {DOMAINS.map((d) => (
                    <option key={d} value={d}>
                      {d.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className={labelCls}>Kind</span>
                <select name="kind" defaultValue={event.kind} className={inputCls}>
                  {EVENT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <label className="flex flex-col gap-1.5">
                <span className={labelCls}>Date</span>
                <input
                  type="date"
                  name="date"
                  required
                  defaultValue={event.dateISO}
                  className={`${inputCls} font-mono`}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelCls}>Start</span>
                <input
                  type="time"
                  name="time"
                  defaultValue={event.timeHM ?? ""}
                  className={`${inputCls} font-mono`}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelCls}>End</span>
                <input
                  type="time"
                  name="end"
                  defaultValue={event.endHM ?? ""}
                  className={`${inputCls} font-mono`}
                />
              </label>
            </div>
            <p className="font-mono text-[9px] uppercase tracking-[.06em] text-faintest">
              Leave start empty for an all-day event
              {event.hasPayload ? " · kind payload attached — preserved on save" : ""}
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="submit"
                className="cursor-pointer border-0 bg-ink px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#ffffff]"
              >
                Save
              </button>
              <button
                type="submit"
                formAction={deleteEventAction}
                className="cursor-pointer border border-border-input bg-subtle px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-status-bad"
              >
                Delete
              </button>
              <Link
                href={`/calendar?view=day&date=${event.dateISO}`}
                className="px-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint"
              >
                Cancel
              </Link>
            </div>
          </form>
        </Panel>
      </main>
    </>
  );
}
