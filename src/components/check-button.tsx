"use client";

/**
 * Design-system check button: square, 1.5px ink border, ink fill + white ✓
 * when checked. Visual size stays 16px (mockup) while the padded hit area is
 * ~32px for one-handed thumbs (NFR-2).
 */
export function CheckButton({
  checked,
  onToggle,
  label,
  size = 16,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  size?: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={label}
      onClick={onToggle}
      className="-m-2 flex-none cursor-pointer border-0 bg-transparent p-2"
    >
      <span
        className={`flex items-center justify-center border-[1.5px] border-ink text-[10px] leading-none ${
          checked ? "bg-ink text-[#ffffff]" : "bg-surface"
        }`}
        style={{ width: size, height: size }}
      >
        {checked ? "✓" : ""}
      </span>
    </button>
  );
}
