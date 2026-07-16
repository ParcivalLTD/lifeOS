import Link from "next/link";
import { Panel } from "@/components/panel";
import type { GymSession, GymWeekDay } from "@/lib/data/gym";

/** Live gym summary on the dashboard (Gym now shipped). */
export function WorkoutCard({
  today,
  weekDays,
}: {
  today: GymSession | null;
  weekDays: GymWeekDay[];
}) {
  const done = weekDays.filter((d) => d.done).length;

  return (
    <Panel
      label="Workout"
      value={today ? `${today.done}/${today.total} sets` : `${done}/${weekDays.length} this wk`}
      footer={
        <Link
          href="/gym"
          className="block border-t border-border-header bg-subtle px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] no-underline"
        >
          Gym →
        </Link>
      }
    >
      {today ? (
        <div className="flex items-baseline justify-between px-3 py-2">
          <span className="text-[12.5px]">{today.name}</span>
          <span className="font-mono text-[11px] text-muted">{today.logged ? "LOGGED" : "TODAY"}</span>
        </div>
      ) : (
        <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[.06em] text-faint">
          No session today · {done}/{weekDays.length} done this week
        </p>
      )}
    </Panel>
  );
}
