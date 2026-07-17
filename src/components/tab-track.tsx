"use client";

import { animate, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

const LOCK_PX = 8; // axis decision distance
const COMMIT_FRAC = 0.28; // fraction of width that commits
const COMMIT_V = 0.45; // px/ms flick velocity that commits
const SPRING = { type: "spring", stiffness: 420, damping: 42 } as const;

/**
 * Adjacent pre-rendered tab track (kills the blank frame on tab swipe).
 *
 * The active tab renders in normal flow; its immediate neighbors are mounted
 * beside it (absolutely positioned at ±100%, clipped to the active tab's
 * height, inert). The finger drags the track between ALREADY-RENDERED,
 * already-populated pages — no mount, no fetch during the drag. On commit the
 * track springs fully across while router.push loads the neighbor route in
 * parallel; the incoming page mounts centered on the very content that is
 * already on screen, so the swap is seamless. That new page then pre-renders
 * ITS neighbors (streamed via Suspense), making the next swipe instant too.
 * Only active ± 1 are ever mounted.
 *
 * Axis lock: within the first LOCK_PX a touch commits to horizontal (we own
 * it — non-passive preventDefault stops scrolling) or vertical (native
 * scroll owns it; the track never moves). Touches starting in fields,
 * [data-no-swipe] (incl. swipeable rows), or horizontal scrollers are never
 * captured. The wrapper uses overflow-x: clip (not hidden) so no scroll
 * container is created and vertical scrolling stays fully native.
 *
 * Reduced motion: swipes still navigate; transitions are instant.
 */
export function TabTrack({
  prevHref,
  nextHref,
  left,
  right,
  children,
}: {
  prevHref: string | null;
  nextHref: string | null;
  left: ReactNode;
  right: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const x = useMotionValue(0);
  const reduced = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigating = useRef(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let t0 = 0;
    let axis: "h" | "v" | null = null;
    let eligible = false;

    const onStart = (e: TouchEvent) => {
      axis = null;
      eligible = false;
      if (navigating.current || e.touches.length !== 1) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [data-no-swipe], .overflow-x-auto")) {
        return;
      }
      eligible = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      t0 = Date.now();
    };

    const onMove = (e: TouchEvent) => {
      if (!eligible || axis === "v") return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;

      if (axis === null) {
        if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return; // undecided
        axis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
        if (axis === "v") return; // native scroll owns this touch
      }

      e.preventDefault(); // horizontal-locked: no scrolling underneath
      const hasTarget = dx < 0 ? nextHref !== null : prevHref !== null;
      x.set(hasTarget ? dx : dx * 0.2); // rubber-band at the ends
    };

    const onEnd = (e: TouchEvent) => {
      if (!eligible || axis !== "h") {
        axis = null;
        return;
      }
      axis = null;
      const width = el.clientWidth || window.innerWidth;
      const dx = e.changedTouches[0].clientX - startX;
      const vx = Math.abs(dx) / Math.max(1, Date.now() - t0);
      const dir = dx < 0 ? 1 : -1;
      const href = dir === 1 ? nextHref : prevHref;

      if (href && (Math.abs(dx) > width * COMMIT_FRAC || vx > COMMIT_V)) {
        navigating.current = true;
        // load the route WHILE the spring plays; the incoming page mounts
        // centered on the same content the track has already revealed
        router.push(href);
        if (reduced) x.set(dir === 1 ? -width : width);
        else animate(x, dir === 1 ? -width : width, SPRING);
      } else if (reduced) {
        x.set(0);
      } else {
        animate(x, 0, SPRING);
      }
    };

    // document-level so swipes work from anywhere below the header —
    // including page background beyond the content's height. The exclusion
    // list (fields, data-no-swipe rows, horizontal scrollers incl. the nav)
    // still gates what can start a track gesture.
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [prevHref, nextHref, reduced, router, x]);

  return (
    <div ref={wrapRef} style={{ overflowX: "clip" }}>
      <motion.div style={{ x }} className="relative">
        {children}
        {left != null && (
          <div
            aria-hidden
            inert
            className="absolute inset-y-0 right-full w-full overflow-hidden"
          >
            {left}
          </div>
        )}
        {right != null && (
          <div
            aria-hidden
            inert
            className="absolute inset-y-0 left-full w-full overflow-hidden"
          >
            {right}
          </div>
        )}
      </motion.div>
    </div>
  );
}
