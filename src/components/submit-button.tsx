"use client";

import { useFormStatus } from "react-dom";

/**
 * Primary submit button with instant pressed feedback for plain server-action
 * forms (the ones without full optimistic state): dims and locks while the
 * action is in flight, so a tap always acknowledges immediately.
 */
export function SubmitButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={
        className ??
        "cursor-pointer border-0 bg-ink px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#ffffff] disabled:opacity-50"
      }
    >
      {children}
    </button>
  );
}
