"use client";

/**
 * Design-system check button: square, 1.5px ink border, ink fill + white ✓
 * when checked. The ✓ glyph is always rendered (transparent when unchecked)
 * so the box's size and text baseline never change on toggle — otherwise a
 * baseline-aligned row visibly shifts when ticked. Visual size stays 16px
 * (mockup); the tappable area is expanded to ~32px via an absolute overlay
 * that doesn't affect layout (NFR-2, one-handed).
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
      style={{ width: size, height: size }}
      className="relative flex-none cursor-pointer border-0 bg-transparent p-0 leading-none after:absolute after:-inset-2 after:content-['']"
    >
      <span
        className={`flex h-full w-full items-center justify-center border-[1.5px] border-ink text-[10px] leading-none ${
          checked ? "bg-ink text-[#ffffff]" : "bg-surface text-transparent"
        }`}
      >
        ✓
      </span>
    </button>
  );
}
