import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export default async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * All routes except static assets and the PWA surface (manifest + icons
     * must stay reachable for installability checks). Everything matched here
     * requires a session, except the public paths in lib/supabase/middleware.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.png|apple-icon\\.png|icons/|manifest\\.webmanifest).*)",
  ],
};
