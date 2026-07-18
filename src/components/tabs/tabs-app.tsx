"use client";

import { animate, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { getTabDataAction } from "@/app/tabs-actions";
import {
  CalendarSkeleton,
  FinanceSkeleton,
  GoalsSkeleton,
  GymSkeleton,
  HabitsSkeleton,
  TasksSkeleton,
  TodaySkeleton,
} from "@/components/tab-skeletons";
import { CalendarViewTab } from "@/components/tabs/views/calendar-view";
import { FinanceViewTab } from "@/components/tabs/views/finance-view";
import { GoalsView } from "@/components/tabs/views/goals-view";
import { GymViewTab } from "@/components/tabs/views/gym-view";
import { HabitsView } from "@/components/tabs/views/habits-view";
import { TasksView } from "@/components/tabs/views/tasks-view";
import { TodayView } from "@/components/tabs/views/today-view";
import {
  TRACK_TABS,
  trackIndex,
  type TabDataMap,
  type TrackTabKey,
} from "@/lib/tab-data";

const LOCK_PX = 8; // axis decision distance
const COMMIT_FRAC = 0.28; // fraction of width that commits
const COMMIT_V = 0.45; // px/ms flick velocity that commits
const SPRING = { type: "spring", stiffness: 420, damping: 42 } as const;

type Cache = Partial<TabDataMap>;

// Module-level so the shell survives the rare route-level remounts (a server
// action POSTed to a pushState URL reconciles the page segment; back/forward
// may re-navigate): data and per-tab scroll reappear instantly instead of
// falling back to skeletons. Single-user, single shell — never two instances.
let savedCache: Cache = {};
const savedScroll: Partial<Record<TrackTabKey, number>> = {};

function TabView({
  tab,
  cache,
  isActive,
}: {
  tab: TrackTabKey;
  cache: Cache;
  isActive: boolean;
}) {
  switch (tab) {
    case "today":
      return cache.today ? <TodayView data={cache.today} /> : <TodaySkeleton />;
    case "goals":
      return cache.goals ? <GoalsView data={cache.goals} /> : <GoalsSkeleton />;
    case "tasks":
      return cache.tasks ? <TasksView data={cache.tasks} /> : <TasksSkeleton />;
    case "habits":
      return cache.habits ? <HabitsView data={cache.habits} /> : <HabitsSkeleton />;
    case "calendar":
      return cache.calendar ? (
        <CalendarViewTab data={cache.calendar} active={isActive} />
      ) : (
        <CalendarSkeleton />
      );
    case "gym":
      return cache.gym ? <GymViewTab data={cache.gym} /> : <GymSkeleton />;
    case "finance":
      return cache.finance ? <FinanceViewTab data={cache.finance} /> : <FinanceSkeleton />;
  }
}

/**
 * ONE persistent client shell for the seven swipeable tabs. The tabs are
 * plain client components co-mounted in a horizontal track — [prev][current]
 * [next] — so a swipe drags between already-rendered, already-populated
 * views: no route change, no mount, no fetch mid-gesture. On commit the
 * track springs across, the neighbor is atomically re-centered
 * (flushSync + x.jump(0), same frame), and the URL/title are synced with
 * history.pushState — which Next mirrors into usePathname WITHOUT
 * re-rendering the route, so the shell (and every input, filter, half-typed
 * form inside it) persists. New neighbors are fetched AFTER settle via a
 * server action into a shared cache keyed by tab.
 *
 * Axis lock: within the first LOCK_PX a touch commits to horizontal (we own
 * it — non-passive preventDefault) or vertical (native scroll; the track
 * never moves). Touches starting in fields, [data-no-swipe] (incl. swipeable
 * rows), or horizontal scrollers are never captured. overflow-x: clip (not
 * hidden) so no scroll container is created and vertical scroll stays native.
 *
 * Reduced motion: swipes and taps still switch tabs; transitions are instant.
 */
export function TabsApp({
  initialTab,
  initialData,
}: {
  initialTab: TrackTabKey;
  initialData: Cache;
}) {
  const [active, setActive] = useState<TrackTabKey>(initialTab);
  // lazy init reads the module cache: empty on first load (matches SSR HTML),
  // warm on route-level remounts
  const [cache, setCache] = useState<Cache>(() => ({ ...savedCache, ...initialData }));
  const x = useMotionValue(0);
  const reduced = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const settling = useRef(false);
  const inflight = useRef(new Set<TrackTabKey>());

  const merge = useCallback((patch: Cache) => {
    setCache((c) => ({ ...c, ...patch }));
  }, []);

  // fresh server data arriving through the route (server-action revalidation,
  // redirect landing on a tab) — merge it in during render (React's
  // adjust-state-on-prop-change pattern), never reset the shell's position
  const [seenInitial, setSeenInitial] = useState(initialData);
  if (seenInitial !== initialData) {
    setSeenInitial(initialData);
    setCache((c) => ({ ...c, ...initialData }));
  }

  // mirror committed cache into the module survivor (side effect, so outside
  // render; declared before the fill effect so reads below see it synced)
  useEffect(() => {
    savedCache = cache;
  }, [cache]);

  const fetchTab = useCallback(
    (k: TrackTabKey) => {
      if (inflight.current.has(k)) return;
      inflight.current.add(k);
      getTabDataAction(k)
        .then((d) => {
          if (d) merge({ [k]: d } as Cache);
        })
        .catch(() => {}) // keep whatever we had; next settle retries
        .finally(() => inflight.current.delete(k));
    },
    [merge],
  );

  // on settling on a tab: refresh it, make sure both neighbors are ready
  // (reads the module mirror, not React state — depending on `cache` here
  // would make the fill effect re-run per merge and fetch in a loop)
  const fillAround = useCallback(
    (center: TrackTabKey) => {
      const i = trackIndex(center);
      fetchTab(center);
      for (const t of [TRACK_TABS[i - 1], TRACK_TABS[i + 1]]) {
        if (t && !savedCache[t.key]) fetchTab(t.key);
      }
    },
    [fetchTab],
  );

  const goTo = useCallback(
    (key: TrackTabKey, opts: { push: boolean }) => {
      if (key === active) return;
      savedScroll[active] = window.scrollY;
      // synchronous re-render + transform reset + scroll restore in one task:
      // the browser never paints the intermediate state
      flushSync(() => setActive(key));
      x.jump(0);
      const t = TRACK_TABS[trackIndex(key)];
      if (opts.push) window.history.pushState(null, "", t.href);
      document.title = t.title;
      window.scrollTo(0, savedScroll[key] ?? 0);
    },
    [active, x],
  );

  // touch gesture — document-level so swipes work from anywhere below the
  // header, including page background beyond the content's height
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let t0 = 0;
    let axis: "h" | "v" | null = null;
    let eligible = false;

    const onStart = (e: TouchEvent) => {
      axis = null;
      eligible = false;
      if (settling.current || e.touches.length !== 1) return;
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
      const i = trackIndex(active);
      const hasTarget = dx < 0 ? i < TRACK_TABS.length - 1 : i > 0;
      x.set(hasTarget ? dx : dx * 0.2); // rubber-band at the ends
    };

    const onEnd = (e: TouchEvent) => {
      if (!eligible || axis !== "h") {
        axis = null;
        return;
      }
      axis = null;
      eligible = false;
      const width = wrapRef.current?.clientWidth || window.innerWidth;
      const dx = e.changedTouches[0].clientX - startX;
      const vx = Math.abs(dx) / Math.max(1, Date.now() - t0);
      const dir = dx < 0 ? 1 : -1;
      const target = TRACK_TABS[trackIndex(active) + dir];

      if (target && (Math.abs(dx) > width * COMMIT_FRAC || vx > COMMIT_V)) {
        if (reduced) {
          goTo(target.key, { push: true }); // instant swap, x jumps home inside
        } else {
          settling.current = true;
          animate(x, dir === 1 ? -width : width, SPRING).then(() => {
            settling.current = false;
            goTo(target.key, { push: true });
          });
        }
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
  }, [active, goTo, reduced, x]);

  // header taps (NavTabs dispatches; preventDefault = we handled it, the
  // Link's route navigation is suppressed) + back/forward
  useEffect(() => {
    const onNav = (e: Event) => {
      const key = (e as CustomEvent<{ key?: string }>).detail?.key;
      if (!key || trackIndex(key as TrackTabKey) < 0) return; // not ours (settings…)
      e.preventDefault();
      goTo(key as TrackTabKey, { push: true }); // no-op if already active
    };
    const onPop = () => {
      const hit = TRACK_TABS.find((t) => t.href === window.location.pathname);
      if (hit) goTo(hit.key, { push: false });
    };
    window.addEventListener("lifeos:tab-nav", onNav);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("lifeos:tab-nav", onNav);
      window.removeEventListener("popstate", onPop);
    };
  }, [goTo]);

  // the settle hook: runs on mount and after every tab switch — refresh the
  // settled tab, pre-load missing neighbors, keep fresh on window re-focus
  useEffect(() => {
    fillAround(active);
    const onFocus = () => fetchTab(active);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [active, fillAround, fetchTab]);

  const idx = trackIndex(active);
  const mounted = [TRACK_TABS[idx - 1], TRACK_TABS[idx], TRACK_TABS[idx + 1]].filter(
    (t): t is (typeof TRACK_TABS)[number] => Boolean(t),
  );

  return (
    <div ref={wrapRef} style={{ overflowX: "clip" }}>
      <motion.div style={{ x }} className="relative">
        {mounted.map((t) => {
          const isActive = t.key === active;
          const side = trackIndex(t.key) < idx ? "right-full" : "left-full";
          return (
            // keyed: a view keeps its component instance (inputs, filters,
            // scroll captives) while sliding between center and neighbor roles
            <div
              key={t.key}
              aria-hidden={isActive ? undefined : true}
              inert={!isActive}
              className={
                isActive ? undefined : `absolute inset-y-0 w-full overflow-hidden ${side}`
              }
            >
              <TabView tab={t.key} cache={cache} isActive={isActive} />
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}
