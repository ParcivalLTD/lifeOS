"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Mobile horizontal-swipe navigation between the top-level tabs, in the same
 * order as the header nav. Swipe left → next tab, right → previous. Mounted in
 * AppHeader so it's active on every app page but not on /login.
 *
 * Guards: single-finger only; must be a fast, clearly-horizontal flick;
 * gestures starting in form controls, horizontal-scroll strips, or anything
 * marked [data-no-swipe] are ignored so they keep their own behaviour.
 * Nested routes (e.g. /tasks/[id]) aren't in the order, so they don't swipe.
 */
const ORDER = ["/", "/tasks", "/habits", "/calendar", "/gym", "/settings"] as const;

const THRESHOLD_PX = 70; // min horizontal distance
const DOMINANCE = 2; // horizontal must beat vertical by this factor
const MAX_MS = 600; // a flick, not a slow drag

export function SwipeNav() {
  const pathname = usePathname();
  const router = useRouter();
  const start = useRef<{ x: number; y: number; t: number; ok: boolean } | null>(
    null,
  );

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        start.current = null;
        return;
      }
      const target = e.target as HTMLElement | null;
      const blocked = target?.closest(
        "input, textarea, select, [data-no-swipe], .overflow-x-auto",
      );
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY, t: Date.now(), ok: !blocked };
    };

    const onEnd = (e: TouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!s || !s.ok) return;

      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Date.now() - s.t > MAX_MS) return;
      if (Math.abs(dx) < THRESHOLD_PX || Math.abs(dx) < DOMINANCE * Math.abs(dy)) {
        return;
      }

      const idx = ORDER.indexOf(pathname as (typeof ORDER)[number]);
      if (idx === -1) return;
      const nextIdx = dx < 0 ? idx + 1 : idx - 1;
      if (nextIdx < 0 || nextIdx >= ORDER.length) return;
      router.push(ORDER[nextIdx]);
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
    };
  }, [pathname, router]);

  return null;
}
