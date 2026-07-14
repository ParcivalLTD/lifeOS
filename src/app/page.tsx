import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Proxy already gates this route; defense in depth.
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-[360px] border border-border-outer bg-surface">
        <div className="flex items-baseline justify-between border-b border-border-header px-3 py-2.5">
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-[15px] font-bold tracking-[.05em]">
              LIFEOS
            </span>
            <span className="border border-border-outer px-[5px] py-px font-mono text-[9px] font-semibold tracking-[.06em] text-faint">
              V0.1
            </span>
          </span>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faint">
            Today
          </span>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-faint">
            Phase 1 — Spine · signed in as{" "}
            <span className="text-ink">{user.email}</span>
          </p>

          <form method="post" action="/auth/logout">
            <button
              type="submit"
              className="cursor-pointer border border-border-input bg-subtle px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.06em]"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
