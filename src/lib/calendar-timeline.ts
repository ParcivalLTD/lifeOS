/**
 * Hour-grid timeline math for the week/day calendar views (FR-CAL.1/2).
 * Pure functions over EventItem — no DOM, no dates beyond the "HH:MM" strings
 * the DTO already carries, so this is trivially testable.
 */
import type { EventItem } from "./event-utils";

/** Row height of one hour. Chosen so the shortest real event in the data
 * (a 15-minute standup) still clears MIN_BLOCK_PX without being stretched —
 * i.e. every block's height is honestly proportional to its duration. */
export const HOUR_PX = 44;

/** Floor for a block's height. At HOUR_PX=44 this is about 19 minutes, so
 * it only ever applies to sub-20-minute events. */
export const MIN_BLOCK_PX = 14;

/** Assumed duration when an event has a start but no end time. Rendered as a
 * real block rather than a zero-height sliver; the block shows only its start
 * time, so nothing claims an end the data doesn't have. */
export const ASSUMED_MIN = 30;

/** Default visible window; expanded (never truncated) to fit outlying events. */
export const DEFAULT_FROM_HOUR = 6;
export const DEFAULT_TO_HOUR = 23;

const DAY_MIN = 24 * 60;

export const hmToMin = (hm: string): number => {
  const [h, m] = hm.split(":");
  return Number(h) * 60 + Number(m);
};

export const minToHM = (min: number): string => {
  const m = ((min % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Hour-gutter label, e.g. 9 → "09". */
export const hourLabel = (hour: number): string => String(hour).padStart(2, "0");

export type Span = { event: EventItem; startMin: number; endMin: number };

/** An event placed in its overlap column: `col` of `cols` side-by-side. */
export type Placed = Span & { col: number; cols: number };

/** Timed events only, in start order, with a resolved [start, end). */
export function spansOf(events: EventItem[]): Span[] {
  return events
    .filter((e) => !e.allDay && e.timeHM)
    .map((event) => {
      const startMin = hmToMin(event.timeHM as string);
      const rawEnd = event.endHM ? hmToMin(event.endHM) : startMin + ASSUMED_MIN;
      // an end at/before the start (bad data, or an end that crossed midnight
      // and got clamped upstream) falls back to the assumed duration
      const endMin = Math.min(
        DAY_MIN,
        rawEnd > startMin ? rawEnd : startMin + ASSUMED_MIN,
      );
      return { event, startMin, endMin };
    })
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
}

/**
 * Lay one day's timed events into side-by-side columns so overlaps are all
 * visible — nothing is stacked or hidden.
 *
 * Events are grouped into clusters of transitively-overlapping events; within
 * a cluster each event takes the leftmost column that is free at its start,
 * and every member reports the cluster's total width so the blocks tile it
 * exactly. Two overlapping events each take half the day's width; three take
 * a third; a non-overlapping event keeps the full width.
 */
export function layoutDay(events: EventItem[]): Placed[] {
  const out: Placed[] = [];
  let cluster: Span[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    const colEnds: number[] = [];
    const placed = cluster.map((span) => {
      let col = colEnds.findIndex((end) => end <= span.startMin);
      if (col === -1) col = colEnds.length;
      colEnds[col] = span.endMin;
      return { ...span, col };
    });
    for (const p of placed) out.push({ ...p, cols: colEnds.length });
    cluster = [];
    clusterEnd = -1;
  };

  for (const span of spansOf(events)) {
    if (cluster.length > 0 && span.startMin >= clusterEnd) flush();
    cluster.push(span);
    clusterEnd = Math.max(clusterEnd, span.endMin);
  }
  flush();
  return out;
}

/**
 * The hour window to render: DEFAULT_FROM_HOUR–DEFAULT_TO_HOUR, widened to
 * whole hours around anything outside it.
 *
 * Widening rather than clipping-and-scrolling is deliberate: an event at 05:00
 * must never be invisible, and a nested scroll container inside the swipe
 * track is a poor mobile citizen. Quiet days stay compact; a day with a 04:30
 * flight grows to fit it.
 */
export function visibleRange(days: EventItem[][]): { fromHour: number; toHour: number } {
  let fromMin = DEFAULT_FROM_HOUR * 60;
  let toMin = DEFAULT_TO_HOUR * 60;
  for (const events of days) {
    for (const s of spansOf(events)) {
      fromMin = Math.min(fromMin, s.startMin);
      toMin = Math.max(toMin, s.endMin);
    }
  }
  return {
    fromHour: Math.floor(fromMin / 60),
    toHour: Math.min(24, Math.ceil(toMin / 60)),
  };
}

/** Pixel geometry of a block within a grid starting at `fromHour`. */
export function blockGeometry(
  span: Span,
  fromHour: number,
): { top: number; height: number } {
  const top = ((span.startMin - fromHour * 60) / 60) * HOUR_PX;
  const height = Math.max(MIN_BLOCK_PX, ((span.endMin - span.startMin) / 60) * HOUR_PX);
  return { top, height };
}

/** How much a block can say without overflowing its height. */
export type BlockDetail = "full" | "title" | "tiny";

export const blockDetail = (height: number): BlockDetail =>
  height >= 34 ? "full" : height >= 20 ? "title" : "tiny";
