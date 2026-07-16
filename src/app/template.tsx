"use client";

import { animate, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Route-level swipe navigation with finger tracking (native-feel experiment).
 *
 * The page content translates with the finger; on release it either springs
 * back or commits — the next route's template instance then slides in from
 * the swipe direction (direction handed over via sessionStorage, since the
 * outgoing page unmounts on navigation).
 *
 * Axis locking (make-or-break): within the first LOCK_PX of movement the
 * touch commits to horizontal (we own it: preventDefault stops scrolling) or
 * vertical (native scroll owns it; we never translate). The touchmove
 * listener is non-passive for exactly this reason. Touches starting in form
 * fields, [data-no-swipe] (incl. swipeable rows), or horizontal scrollers
 * are never captured.
 *
 * Reduced motion: swipes still navigate, but transitions are instant.
 */
const ORDER = ["/", "/goals", "/tasks", "/habits", "/calendar", "/gym", "/finance", "/settings"];
const LOCK_PX = 8; // axis decision distance
const COMMIT_PX = 72; // drag distance that commits navigation
const COMMIT_V = 0.45; // px/ms flick velocity that commits
const ENTRY_PX = 56; // incoming page slide-in offset
const SPRING = { type: "spring", stiffness: 420, damping: 40 } as const;
const DIR_KEY = "lifeos-nav-dir";

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const x = useMotionValue(0);
  const reduced = useReducedMotion();

  // entry slide for the incoming page (direction set by the committing swipe)
  useEffect(() => {
    const dir = Number(sessionStorage.getItem(DIR_KEY) ?? 0);
    sessionStorage.removeItem(DIR_KEY);
    if (dir !== 0 && !reduced) {
      x.set(dir * ENTRY_PX);
      animate(x, 0, SPRING);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const idx = ORDER.indexOf(pathname);
    let startX = 0;
    let startY = 0;
    let t0 = 0;
    let axis: "h" | "v" | null = null;
    let eligible = false;

    const onStart = (e: TouchEvent) => {
      axis = null;
      eligible = false;
      if (idx === -1 || e.touches.length !== 1) return;
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
        if (axis === "v") return; // native scroll owns this touch from here on
      }

      // horizontal-locked: we own the touch — no scrolling underneath
      e.preventDefault();
      const dir = dx < 0 ? 1 : -1; // left swipe → next tab
      const hasTarget = ORDER[idx + dir] !== undefined;
      // full tracking toward a real target; heavy resistance at the ends
      x.set(hasTarget ? dx : dx * 0.22);
    };

    const onEnd = (e: TouchEvent) => {
      if (!eligible || axis !== "h") {
        axis = null;
        return;
      }
      axis = null;
      const dx = e.changedTouches[0].clientX - startX;
      const vx = Math.abs(dx) / Math.max(1, Date.now() - t0);
      const dir = dx < 0 ? 1 : -1;
      const target = ORDER[idx + dir];

      if (target && (Math.abs(dx) > COMMIT_PX || vx > COMMIT_V)) {
        sessionStorage.setItem(DIR_KEY, String(dir));
        if (reduced) {
          x.set(0);
        } else {
          // ease the outgoing page a little further in the swipe direction
          animate(x, dx < 0 ? dx - 40 : dx + 40, { duration: 0.1 });
        }
        router.push(target);
      } else if (reduced) {
        x.set(0);
      } else {
        animate(x, 0, SPRING);
      }
    };

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
  }, [pathname, router, reduced, x]);

  return <motion.div style={{ x }}>{children}</motion.div>;
}
