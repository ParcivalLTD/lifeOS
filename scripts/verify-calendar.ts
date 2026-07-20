/**
 * Calendar timeline verification (FR-CAL.1/2) — the week/day hour grid.
 *
 * Two halves: the layout math against fixed shapes (proportional sizing,
 * overlap columns, degenerate data), then the SAME math against the real
 * seeded events for this week, asserting the overlaps that actually exist in
 * the data are laid out side by side rather than stacked or hidden.
 *
 * Read-only — creates nothing.
 *
 * Usage: npm run test:calendar
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : `  ${detail}`}`);
};

async function main() {
  const { closeDb } = await import("@/db");
  const {
    blockDetail, blockGeometry, HOUR_PX, layoutDay, spansOf, visibleRange,
  } = await import("@/lib/calendar-timeline");
  const { weekDates } = await import("@/lib/calendar");
  const { listEventsInRange } = await import("@/lib/data/events");
  const { addDaysISO, todayISO } = await import("@/lib/dates");
  type EventItem = import("@/lib/event-utils").EventItem;

  const OWNER = process.env.SEED_USER_ID!;
  const ev = (
    id: string, timeHM: string | null, endHM: string | null, allDay = false,
  ): EventItem => ({
    id, title: id, domain: "work", kind: "session", allDay,
    dateISO: todayISO(), timeHM, endHM, hasPayload: false,
  });

  // --- 1. sizing is proportional to duration -------------------------------
  const sized = layoutDay([
    ev("15min", "09:00", "09:15"),
    ev("1h", "11:00", "12:00"),
    ev("3h", "14:00", "17:00"),
  ]);
  const h = (id: string) =>
    blockGeometry(sized.find((p) => p.event.id === id)!, 6).height;
  check("1h block is exactly one hour row", h("1h") === HOUR_PX, `${h("1h")}`);
  check("3h block is 3× a 1h block", h("3h") === 3 * h("1h"), `${h("3h")}`);
  check("15min block is a quarter of 1h (not a uniform row)",
    h("15min") === HOUR_PX / 4, `${h("15min")}`);
  check("shorter events are visibly shorter", h("15min") < h("1h") && h("1h") < h("3h"));
  const top = blockGeometry(sized.find((p) => p.event.id === "1h")!, 6).top;
  check("11:00 positions 5 hours down a 06:00 grid", top === 5 * HOUR_PX, `${top}`);

  // --- 2. overlaps go side by side -----------------------------------------
  const two = layoutDay([ev("a", "09:00", "10:30"), ev("b", "09:30", "11:00")]);
  check("2 overlapping events → 2 columns", two.every((p) => p.cols === 2));
  check("2 overlapping events → distinct columns",
    new Set(two.map((p) => p.col)).size === 2);
  const three = layoutDay([
    ev("a", "09:00", "12:00"), ev("b", "09:30", "10:30"), ev("c", "10:00", "11:00"),
  ]);
  check("3-way overlap → 3 columns, all distinct",
    three.every((p) => p.cols === 3) && new Set(three.map((p) => p.col)).size === 3);
  const apart = layoutDay([ev("a", "09:00", "10:00"), ev("b", "10:00", "11:00")]);
  check("touching-but-not-overlapping events stay full width",
    apart.every((p) => p.cols === 1));
  check("no event is dropped by the layout", three.length === 3);

  // --- 3. degenerate data --------------------------------------------------
  check("all-day items never enter the timed layout",
    layoutDay([ev("x", null, null, true)]).length === 0);
  check("an event with no start time is skipped",
    spansOf([ev("x", null, null)]).length === 0);
  const noEnd = layoutDay([ev("x", "09:00", null)]);
  check("no end time → assumed 30min block, still visible",
    blockGeometry(noEnd[0], 6).height === HOUR_PX / 2);
  const bad = layoutDay([ev("x", "09:00", "08:00")]);
  check("end before start never yields a negative/zero block",
    blockGeometry(bad[0], 6).height > 0);

  // --- 4. visible window ---------------------------------------------------
  const def = visibleRange([[ev("x", "09:00", "10:00")]]);
  check("default window is 06–23", def.fromHour === 6 && def.toHour === 23,
    JSON.stringify(def));
  check("an 04:30 event widens the window instead of hiding",
    visibleRange([[ev("x", "04:30", "06:00")]]).fromHour === 4);
  check("a 23:30 event widens the window instead of hiding",
    visibleRange([[ev("x", "23:00", "23:59")]]).toHour === 24);

  // --- 5. small blocks degrade instead of overflowing -----------------------
  check("3h block shows time + title", blockDetail(h("3h")) === "full");
  check("15min block degrades to title-only", blockDetail(h("15min")) === "tiny",
    blockDetail(h("15min")));

  // --- 6. the REAL seeded week ---------------------------------------------
  const today = todayISO();
  const days = weekDates(today);
  const events = await listEventsInRange(OWNER, days[0], addDaysISO(days[6], 1));
  const byDate = new Map<string, EventItem[]>();
  for (const e of events) byDate.set(e.dateISO, [...(byDate.get(e.dateISO) ?? []), e]);

  check("seed week has events to lay out", events.length > 0, `${events.length}`);

  let overlapDays = 0;
  let widest = 1;
  for (const d of days) {
    const placed = layoutDay(byDate.get(d) ?? []);
    const timed = (byDate.get(d) ?? []).filter((e) => !e.allDay && e.timeHM);
    check(`  ${d}: every timed event is placed`, placed.length === timed.length,
      `${placed.length}/${timed.length}`);
    // no two events may share a column while overlapping in time
    for (const a of placed) {
      for (const b of placed) {
        if (a.event.id >= b.event.id) continue;
        const overlaps = a.startMin < b.endMin && b.startMin < a.endMin;
        if (overlaps && a.col === b.col) {
          check(`  ${d}: ${a.event.title} / ${b.event.title} collide in one column`, false);
        }
      }
    }
    const cols = Math.max(1, ...placed.map((p) => p.cols));
    if (cols > 1) overlapDays++;
    widest = Math.max(widest, cols);
    // blocks must stay inside the rendered grid
    const { fromHour, toHour } = visibleRange([byDate.get(d) ?? []]);
    for (const p of placed) {
      const g = blockGeometry(p, fromHour);
      const okTop = g.top >= 0;
      const okBottom = g.top + g.height <= (toHour - fromHour) * HOUR_PX + 0.001;
      if (!okTop || !okBottom) {
        check(`  ${d}: ${p.event.title} escapes the grid`, false,
          `top=${g.top} h=${g.height}`);
      }
    }
  }
  check("seed week actually exercises overlapping events", overlapDays > 0,
    "no day had concurrent events — the side-by-side path is untested");
  console.log(`      (widest overlap cluster in the seeded week: ${widest} columns)`);

  const allDay = events.filter((e) => e.allDay);
  check("seed week has all-day items for the strip", allDay.length > 0, `${allDay.length}`);
  check("all-day items are excluded from every day's timed layout",
    days.every((d) =>
      layoutDay(byDate.get(d) ?? []).every((p) => !p.event.allDay)));

  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
