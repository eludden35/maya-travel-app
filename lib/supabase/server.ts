import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client for App Router.
 *
 * Use in Server Components, Server Actions, and Route Handlers. Honors the
 * trust boundary from `.cursor/skills/project-architecture/SKILL.md`:
 *
 * - Reads only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
 * - Does NOT touch `SUPABASE_SERVICE_ROLE_KEY`. Service-role access lives in
 *   server-only modules under `lib/supabase/admin/*` (added when needed; not
 *   in the scaffold).
 *
 * Server Components cannot set cookies. The `try/catch` around `cookieStore.set`
 * is the official Supabase pattern: when this client is used inside a Server
 * Component, the cookie write throws; we swallow it because the proxy
 * (`proxy.ts` -> `updateSession`) already refreshed the session for the
 * current request.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components are read-only for cookies; middleware handles refresh.
          }
        },
      },
    },
  );
}
