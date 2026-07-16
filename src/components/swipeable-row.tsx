"use client";

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
} from "framer-motion";
import { useRef, useState, type ReactNode } from "react";

const OPEN = 84; // px a side stays open
const TRIGGER = 48; // min drag distance to snap open
const SPRING = { type: "spring", stiffness: 500, damping: 38 } as const;

export type SwipeAction = {
  label: string;
  onAction: () => void;
  /** "ink" (complete/tick) or "bad" (delete/archive). */
  tone: "ink" | "bad";
};

/**
 * Native-style swipeable list row. The row tracks the finger horizontally and
 * springs open (revealing an action) or closed on release; tapping the
 * revealed action fires it and springs the row shut.
 *
 * Axis locking (the make-or-break): `touch-action: pan-y` lets the browser
 * own vertical panning natively — vertical scrolls never reach us — while
 * Framer's `dragDirectionLock` commits to one axis within the first few px
 * of pointer movement, so a horizontal reveal never fights list scrolling.
 *
 * Reduced motion: reveals still work (function is preserved) but snaps are
 * instant instead of sprung.
 */
export function SwipeableRow({
  children,
  leftAction,
  rightAction,
}: {
  children: ReactNode;
  /** Revealed when swiping right (sits under the left edge). */
  leftAction?: SwipeAction;
  /** Revealed when swiping left (sits under the right edge). */
  rightAction?: SwipeAction;
}) {
  const x = useMotionValue(0);
  const reduced = useReducedMotion();
  const dragging = useRef(false);
  // which side is open — gates the hidden buttons out of tab order / a11y tree
  const [open, setOpen] = useState<"left" | "right" | null>(null);

  const settle = (to: number) => {
    setOpen(to < 0 ? "right" : to > 0 ? "left" : null);
    if (reduced) x.set(to);
    else animate(x, to, SPRING);
  };

  const fire = (action: SwipeAction) => {
    action.onAction();
    settle(0);
  };

  const onDragEnd = (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    // brief window so the release-click doesn't activate row links
    setTimeout(() => (dragging.current = false), 50);
    const current = x.get();
    const throwX = info.velocity.x * 0.05;
    const projected = current + throwX;
    if (rightAction && projected < -TRIGGER) return settle(-OPEN);
    if (leftAction && projected > TRIGGER) return settle(OPEN);
    settle(0);
  };

  const actionCls =
    "flex cursor-pointer items-center justify-center border-0 font-mono text-[10px] font-semibold uppercase tracking-[.06em] text-[#ffffff]";

  return (
    <div className="relative overflow-hidden" data-no-swipe>
      {/* action layers under the row */}
      {leftAction && (
        <button
          type="button"
          onClick={() => fire(leftAction)}
          aria-label={leftAction.label}
          aria-hidden={open !== "left"}
          tabIndex={open === "left" ? 0 : -1}
          className={actionCls}
          style={{
            position: "absolute",
            insetBlock: 0,
            left: 0,
            width: OPEN,
            background: leftAction.tone === "bad" ? "oklch(0.55 0.13 20)" : "#1a1a18",
          }}
        >
          {leftAction.label}
        </button>
      )}
      {rightAction && (
        <button
          type="button"
          onClick={() => fire(rightAction)}
          aria-label={rightAction.label}
          aria-hidden={open !== "right"}
          tabIndex={open === "right" ? 0 : -1}
          className={actionCls}
          style={{
            position: "absolute",
            insetBlock: 0,
            right: 0,
            width: OPEN,
            background: rightAction.tone === "bad" ? "oklch(0.55 0.13 20)" : "#1a1a18",
          }}
        >
          {rightAction.label}
        </button>
      )}

      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{
          left: rightAction ? -OPEN : 0,
          right: leftAction ? OPEN : 0,
        }}
        dragElastic={0.12}
        dragMomentum={false}
        style={{ x, touchAction: "pan-y" }}
        onDragStart={() => (dragging.current = true)}
        onDragEnd={onDragEnd}
        onClickCapture={(e) => {
          // a drag-release must not activate links/buttons inside the row;
          // an open row closes on tap instead of navigating
          if (dragging.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (x.get() !== 0) {
            e.preventDefault();
            e.stopPropagation();
            settle(0);
          }
        }}
        className="relative bg-surface"
      >
        {children}
      </motion.div>
    </div>
  );
}
