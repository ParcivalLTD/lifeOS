"use client";

import { useEffect, useState } from "react";

/**
 * Two-step destructive button: first tap arms it (label flips to the confirm
 * text, styling turns bad-red), second tap within 3.5s submits via
 * `formAction`. Keeps confirmation inline and flat — no browser dialogs.
 */
export function ConfirmButton({
  label,
  confirmLabel = "Confirm — sure?",
  formAction,
}: {
  label: string;
  confirmLabel?: string;
  formAction: (formData: FormData) => void | Promise<void>;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="cursor-pointer border border-border-input bg-subtle px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-status-bad"
      >
        {label}
      </button>
    );
  }

  return (
    <button
      type="submit"
      formAction={formAction}
      className="cursor-pointer border border-status-bad bg-status-bad px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#ffffff]"
    >
      {confirmLabel}
    </button>
  );
}
