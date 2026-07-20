import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "HELM — SIGN IN",
};

const inputClass =
  "w-full border border-border-input bg-subtle px-2.5 py-2 text-[12.5px]";
const labelClass =
  "font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faint";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-[360px] border border-border-outer bg-surface">
        <div className="flex items-baseline justify-between border-b border-border-header px-3 py-2.5">
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-[15px] font-bold tracking-[.05em]">
              HELM
            </span>
            <span className="border border-border-outer px-[5px] py-px font-mono text-[9px] font-semibold tracking-[.06em] text-faint">
              V0.1
            </span>
          </span>
          <span className={labelClass}>Sign in</span>
        </div>

        <form method="post" action="/auth/login" className="flex flex-col gap-3 p-4">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Email</span>
            <input
              type="email"
              name="email"
              required
              autoFocus
              autoComplete="username"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Password</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className={inputClass}
            />
          </label>

          {error ? (
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-status-bad">
              Invalid email or password
            </p>
          ) : null}

          <button
            type="submit"
            className="mt-1 cursor-pointer border-0 bg-ink px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-[#ffffff]"
          >
            Sign in
          </button>

          <p className="font-mono text-[9px] uppercase tracking-[.06em] text-faintest">
            Single-user system — no sign-up. The owner account is created in
            Supabase.
          </p>
        </form>
      </div>
    </main>
  );
}
