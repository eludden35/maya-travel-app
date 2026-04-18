import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresh the Supabase auth session on every request that flows through the
 * Next.js proxy (`proxy.ts` at the repo root — Next.js 16's successor to
 * `middleware.ts`).
 *
 * The official `@supabase/ssr` pattern: cookies set by the auth client during
 * `getUser()` MUST be re-set on the outgoing response, otherwise sessions
 * silently stop refreshing. We follow the documented pattern verbatim.
 *
 * Do NOT add logic between creating the client and calling `getUser()` — see
 * Supabase docs ("Important: do not run code between createServerClient and
 * supabase.auth.getUser").
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
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // IMPORTANT: keep this call immediately after createServerClient. Anything
  // between the two breaks session refresh in subtle ways.
  await supabase.auth.getUser();

  return supabaseResponse;
}
