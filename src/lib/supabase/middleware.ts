import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Routes reachable without a session (everything else requires the owner).
 * /api/backup and /api/sync/apple-calendar enforce their own auth (a bearer
 * secret or a session) so the scheduled-task callers (Coolify) aren't bounced
 * to /login.
 */
const PUBLIC_PATHS = [
  "/login",
  "/auth/login",
  "/auth/logout",
  "/api/backup",
  "/api/sync/apple-calendar",
];

const isPublicPath = (pathname: string) =>
  PUBLIC_PATHS.some((p) => pathname === p);

/**
 * Refreshes the Supabase session on every request and gates all app routes.
 * Canonical @supabase/ssr pattern: the client reads cookies from the request
 * and writes refreshed tokens onto both the request (for this render) and the
 * response (for the browser).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and auth.getUser() — a token
  // refresh can happen here, and skipping it desyncs the session cookies.
  // getUser() revalidates against the auth server; never trust getSession()
  // for access control.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const redirectWithCookies = (path: string) => {
    // Behind the Traefik proxy nextUrl carries the internal host; prefer the
    // configured public URL so Location headers point at the real origin.
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
    const redirect = NextResponse.redirect(new URL(path, base));
    // Carry refreshed session cookies across the redirect.
    supabaseResponse.cookies
      .getAll()
      .forEach(({ name, value, ...options }) =>
        redirect.cookies.set(name, value, options),
      );
    return redirect;
  };

  if (!user && !isPublicPath(pathname)) {
    return redirectWithCookies("/login");
  }
  if (user && pathname === "/login") {
    return redirectWithCookies("/");
  }

  return supabaseResponse;
}
