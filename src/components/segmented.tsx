import Link from "next/link";

const base =
  "min-h-[36px] cursor-pointer whitespace-nowrap border px-3 py-1.5 text-center font-mono text-[10px] font-semibold uppercase tracking-[.06em] no-underline";
const idle = `${base} border-border-input bg-subtle text-ink`;
const on = `${base} border-ink bg-ink text-[#ffffff]`;

export type Segment = { key: string; label: string; href: string };

/** The Assistant tab's two sub-views. Unlike the track's merged tabs these
 * are separate routes (the chat owns its own URL for resumable conversations
 * — `/assistant?c=…`), so they navigate rather than switching in place. */
export const ASSISTANT_SEGMENTS: Segment[] = [
  { key: "chat", label: "Chat", href: "/assistant" },
  { key: "reviews", label: "Reviews", href: "/review" },
];

/**
 * The sub-view switch that sits at the top of a merged tab (Tasks|Habits,
 * Academic|Work, Chat|Reviews). It swaps WHOLE views — each keeps its own
 * filters, forms and empty states; nothing is blended into a shared list.
 *
 * Two flavours by call site: inside the co-mounted track the caller passes
 * `onSelect` and the buttons switch segments client-side (an <a> navigation
 * there would remount the whole shell); the Assistant tab's segments are
 * separate routes, so it passes none and these render as plain links.
 */
export function Segmented({
  segments,
  active,
  onSelect,
  width = 1280,
}: {
  segments: Segment[];
  active: string;
  onSelect?: (key: string) => void;
  /** match the page content's container so the control lines up with it */
  width?: number;
}) {
  return (
    <div
      className="mx-auto w-full px-4 pt-4"
      style={{ maxWidth: `${width}px` }}
      data-segmented
      data-no-swipe
    >
      <div className="flex gap-1">
        {segments.map((s) =>
          onSelect ? (
            <button
              key={s.key}
              type="button"
              aria-current={s.key === active ? "page" : undefined}
              onClick={() => onSelect(s.key)}
              className={s.key === active ? on : idle}
            >
              {s.label}
            </button>
          ) : (
            <Link
              key={s.key}
              href={s.href}
              aria-current={s.key === active ? "page" : undefined}
              className={s.key === active ? on : idle}
            >
              {s.label}
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
