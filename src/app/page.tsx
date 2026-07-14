export default function Home() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="border border-border-outer bg-surface px-8 py-6 text-center">
        <div className="flex items-baseline justify-center gap-2">
          <span className="font-mono text-[15px] font-bold tracking-[.05em]">
            LIFEOS
          </span>
          <span className="border border-border-outer px-[5px] py-px font-mono text-[9px] font-semibold tracking-[.06em] text-faint">
            V0.1
          </span>
        </div>
        <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faint">
          Phase 1 — Spine · scaffold only, no UI yet
        </p>
      </div>
    </main>
  );
}
