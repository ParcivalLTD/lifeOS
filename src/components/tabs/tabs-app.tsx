"use client";

import { animate, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { getTabsDataAction } from "@/app/tabs-actions";
import { Segmented } from "@/components/segmented";
import {
  AcademicSkeleton,
  CalendarSkeleton,
  FinanceSkeleton,
  GymSkeleton,
  HabitsSkeleton,
  TasksSkeleton,
  TodaySkeleton,
  WorkSkeleton,
} from "@/components/tab-skeletons";
import { AcademicViewTab } from "@/components/tabs/views/academic-view";
import { CalendarViewTab } from "@/components/tabs/views/calendar-view";
import { FinanceViewTab } from "@/components/tabs/views/finance-view";
import { GymViewTab } from "@/components/tabs/views/gym-view";
import { HabitsView } from "@/components/tabs/views/habits-view";
import { TasksView } from "@/components/tabs/views/tasks-view";
import { TodayView } from "@/components/tabs/views/today-view";
import { WorkViewTab } from "@/components/tabs/views/work-view";
import {
  tabForView,
  trackIndex,
  trackView,
  TRACK_TABS,
  TRACK_VIEW_KEYS,
  viewForPath,
  type TabDataMap,
  type TrackTab,
  type TrackTabKey,
  type TrackViewKey,
} from "@/lib/tab-data";

const LOCK_PX = 8; // axis decision distance
const COMMIT_FRAC = 0.28; // fraction of width that commits
const COMMIT_V = 0.45; // px/ms flick velocity that commits
// loose rest thresholds: the spring "completes" the moment it LOOKS settled
// instead of hunting the last fraction of a pixel
const SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 42,
  restDelta: 0.5,
  restSpeed: 10,
} as const;
const STALE_MS = 60_000; // cached view age before a background refresh

type Cache = Partial<TabDataMap>;

// Module-level so the shell survives the rare route-level remounts (a server
// action POSTed to a pushState URL reconciles the page segment; back/forward
// may re-navigate): data, per-view scroll and the chosen segment of each
// merged tab reappear instantly instead of falling back to skeletons.
// Single-user, single shell — never two instances.
let savedCache: Cache = {};
const savedScroll: Partial<Record<TrackViewKey, number>> = {};
const fetchedAt: Partial<Record<TrackViewKey, number>> = {};
const savedSegment: Partial<Record<TrackTabKey, TrackViewKey>> = {};

// merge that drops unchanged payloads: identical JSON means no new object
// identities, no re-render, no chart re-animation — landing on a view whose
// data didn't move costs nothing visually
const mergePatch = (c: Cache, patch: Cache): Cache => {
  let changed = false;
  const next: Cache = { ...c };
  for (const k of Object.keys(patch) as TrackViewKey[]) {
    const v = patch[k];
    if (v && JSON.stringify(next[k]) !== JSON.stringify(v)) {
      (next as Record<string, unknown>)[k] = v;
      changed = true;
    }
  }
  return changed ? next : c;
};

function TabView({
  view,
  cache,
  isActive,
}: {
  view: TrackViewKey;
  cache: Cache;
  isActive: boolean;
}) {
  switch (view) {
    case "today":
      return cache.today ? <TodayView data={cache.today} /> : <TodaySkeleton />;
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
    case "academic":
      return cache.academic ? <AcademicViewTab data={cache.academic} /> : <AcademicSkeleton />;
    case "work":
      return cache.work ? <WorkViewTab data={cache.work} /> : <WorkSkeleton />;
    case "gym":
      return cache.gym ? <GymViewTab data={cache.gym} /> : <GymSkeleton />;
    case "finance":
      return cache.finance ? <FinanceViewTab data={cache.finance} /> : <FinanceSkeleton />;
  }
}

/** One track tab: its segmented control (only when it merges two views) above
 * whichever view is selected. Both segments' DTOs are cached, so flipping the
 * segment is as instant as a swipe. */
function TabPane({
  tab,
  view,
  cache,
  isActive,
  onSelect,
}: {
  tab: TrackTab;
  view: TrackViewKey;
  cache: Cache;
  isActive: boolean;
  onSelect: (view: TrackViewKey) => void;
}) {
  return (
    <>
      {tab.views.length > 1 && (
        <Segmented
          segments={tab.views}
          active={view}
          width={tab.width}
          onSelect={(k) => onSelect(k as TrackViewKey)}
        />
      )}
      <TabView view={view} cache={cache} isActive={isActive} />
    </>
  );
}

/**
 * ONE persistent client shell for the six swipeable tabs. The tabs are plain
 * client components co-mounted in a horizontal track — [prev][current][next]
 * — so a swipe drags between already-rendered, already-populated views: no
 * route change, no mount, no fetch mid-gesture. On commit the track springs
 * across, the neighbor is atomically re-centered (flushSync + x.jump(0), same
 * frame), and the URL/title are synced with history.pushState — which Next
 * mirrors into usePathname WITHOUT re-rendering the route, so the shell (and
 * every input, filter, half-typed form inside it) persists. Uncached views
 * are fetched AFTER settle via a server action into a shared cache.
 *
 * Two tabs merge two views behind a segmented control (Daily = Tasks|Habits,
 * Acad & Work = Academic|Work). The track's unit is still the TAB — a swipe
 * moves tab-to-tab and lands on whichever segment that tab was last left on,
 * while the segmented control switches within a tab without moving the track.
 * Both of a merged tab's DTOs are prefetched together, so neither path ever
 * shows a skeleton.
 *
 * Axis lock: within the first LOCK_PX a touch commits to horizontal (we own
 * it — non-passive preventDefault) or vertical (native scroll; the track
 * never moves). Touches starting in fields, [data-no-swipe] (incl. swipeable
 * rows and the segmented control), or horizontal scrollers are never
 * captured. overflow-x: clip (not hidden) so no scroll container is created
 * and vertical scroll stays native.
 *
 * Reduced motion: swipes and taps still switch tabs; transitions are instant.
 */
export function TabsApp({
  initialView,
  initialData,
}: {
  initialView: TrackViewKey;
  initialData: Cache;
}) {
  const [active, setActive] = useState<TrackTabKey>(() => tabForView(initialView).key);
  // which segment each merged tab is showing; seeded from the landing route,
  // then remembered for the session (module mirror survives remounts)
  const [segment, setSegment] = useState<Partial<Record<TrackTabKey, TrackViewKey>>>(() => ({
    ...savedSegment,
    [tabForView(initialView).key]: initialView,
  }));
  // lazy init reads the module cache: empty on first load (matches SSR HTML),
  // warm on route-level remounts
  const [cache, setCache] = useState<Cache>(() => ({ ...savedCache, ...initialData }));
  const x = useMotionValue(0);
  const reduced = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const settling = useRef(false);
  const inflight = useRef(new Set<TrackViewKey>());

  const viewOf = useCallback(
    (tab: TrackTabKey): TrackViewKey =>
      segment[tab] ?? TRACK_TABS[trackIndex(tab)].views[0].key,
    [segment],
  );
  const activeView = viewOf(active);

  const merge = useCallback((patch: Cache) => {
    const now = Date.now();
    for (const k of Object.keys(patch) as TrackViewKey[]) fetchedAt[k] = now;
    setCache((c) => mergePatch(c, patch));
  }, []);

  // fresh server data arriving through the route (server-action revalidation,
  // redirect landing on a view) — merge it in during render (React's
  // adjust-state-on-prop-change pattern), never reset the shell's position
  const [seenInitial, setSeenInitial] = useState(initialData);
  if (seenInitial !== initialData) {
    setSeenInitial(initialData);
    setCache((c) => mergePatch(c, initialData));
  }

  // a route render means the server rebuilt this trio: its keys are fresh,
  // and whatever mutation caused it may have touched the OTHER cached views
  // (a task tick changes Today too) — mark those stale so their next visit
  // refreshes in the background while still painting from cache
  useEffect(() => {
    const now = Date.now();
    for (const k of TRACK_VIEW_KEYS) {
      if (initialData[k]) fetchedAt[k] = now;
      else delete fetchedAt[k];
    }
  }, [initialData]);

  // mirror committed cache/segment into the module survivors (side effects, so
  // outside render; declared before the fill effect so reads below see them)
  useEffect(() => {
    savedCache = cache;
  }, [cache]);
  useEffect(() => {
    Object.assign(savedSegment, segment);
  }, [segment]);

  const fetchViews = useCallback(
    (keys: TrackViewKey[]) => {
      const need = keys.filter((k) => !inflight.current.has(k));
      if (need.length === 0) return;
      for (const k of need) inflight.current.add(k);
      getTabsDataAction(need)
        .then((map) => merge(map as Cache))
        .catch(() => {}) // keep whatever we had; next settle retries
        .finally(() => {
          for (const k of need) inflight.current.delete(k);
        });
    },
    [merge],
  );

  // on settling on a view: refresh it only when its cache has actually aged
  // (a fresh landing repaints nothing — no data pop-in after the swipe), and
  // fill EVERY still-missing view in the same single round-trip so later
  // swipes, segment flips and header taps land on data, not skeletons. (Reads
  // the module mirror, not React state — depending on `cache` here would make
  // the fill effect re-run per merge and fetch in a loop.)
  const ensureAround = useCallback(
    (center: TrackViewKey) => {
      const stale = (fetchedAt[center] ?? 0) < Date.now() - STALE_MS;
      const want = TRACK_VIEW_KEYS.filter(
        (k) => !savedCache[k] || (k === center && stale),
      );
      if (want.length) fetchViews(want);
    },
    [fetchViews],
  );

  /** Adopt a view as current: URL, title and scroll, in one paint. */
  const land = useCallback(
    (from: TrackViewKey, to: TrackViewKey, push: boolean, apply: () => void) => {
      savedScroll[from] = window.scrollY;
      // synchronous re-render + transform re-anchor + scroll restore in one
      // task: the browser never paints the intermediate state
      flushSync(apply);
      const v = trackView(to);
      if (push) window.history.pushState(null, "", v.href);
      document.title = v.title;
      window.scrollTo(0, savedScroll[to] ?? 0);
    },
    [],
  );

  const goTo = useCallback(
    (key: TrackTabKey, opts: { push: boolean; jumpTo?: number }) => {
      if (key === active) return;
      // jumpTo lets the swipe path re-anchor mid-gesture instead of resetting
      land(activeView, viewOf(key), opts.push, () => {
        setActive(key);
        x.jump(opts.jumpTo ?? 0);
      });
    },
    [active, activeView, land, viewOf, x],
  );

  /** Segmented-control tap: swap the view WITHIN a tab — the track never
   * moves, and the other segment's own state stays mounted-adjacent in cache. */
  const selectView = useCallback(
    (next: TrackViewKey) => {
      const tab = tabForView(next).key;
      if (viewOf(tab) === next) return;
      land(viewOf(tab), next, true, () => setSegment((s) => ({ ...s, [tab]: next })));
    },
    [land, viewOf],
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
          // commit at finger-release: swap active/URL NOW, re-anchoring x so
          // no pixel moves, then spring the already-committed track home.
          // Settle fetches overlap the animation instead of queuing after it.
          const v = x.getVelocity();
          settling.current = true;
          goTo(target.key, { push: true, jumpTo: x.get() + dir * width });
          animate(x, 0, { ...SPRING, velocity: v }).then(() => {
            settling.current = false;
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
      if (!key || trackIndex(key as TrackTabKey) < 0) return; // not ours (assistant, settings…)
      e.preventDefault();
      goTo(key as TrackTabKey, { push: true }); // no-op if already active
    };
    const onPop = () => {
      const hit = viewForPath(window.location.pathname);
      if (!hit) return;
      const tab = tabForView(hit).key;
      if (tab === active) selectView(hit);
      else if (viewOf(tab) === hit) goTo(tab, { push: false });
      else {
        // back onto a merged tab's OTHER segment: set the segment, then move
        land(activeView, hit, false, () => {
          setSegment((s) => ({ ...s, [tab]: hit }));
          setActive(tab);
          x.jump(0);
        });
      }
    };
    window.addEventListener("helm:tab-nav", onNav);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("helm:tab-nav", onNav);
      window.removeEventListener("popstate", onPop);
    };
  }, [active, activeView, goTo, land, selectView, viewOf, x]);

  // the settle hook: runs on mount and after every tab/segment switch —
  // background-refresh the settled view if aged, batch-fill anything
  // uncached, and refresh on window re-focus after time away
  useEffect(() => {
    ensureAround(activeView);
    const onFocus = () => {
      if ((fetchedAt[activeView] ?? 0) < Date.now() - STALE_MS) fetchViews([activeView]);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [activeView, ensureAround, fetchViews]);

  const idx = trackIndex(active);
  const mounted = [TRACK_TABS[idx - 1], TRACK_TABS[idx], TRACK_TABS[idx + 1]].filter(
    (t): t is TrackTab => Boolean(t),
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
              <TabPane
                tab={t}
                view={viewOf(t.key)}
                cache={cache}
                isActive={isActive}
                onSelect={selectView}
              />
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}
