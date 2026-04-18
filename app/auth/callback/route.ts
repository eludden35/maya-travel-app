import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Magic-link callback. Supabase redirects the user here after they click the
 * link in their email; the `code` query param is exchanged for a session
 * cookie via `exchangeCodeForSession`. After that, `/` shows their email
 * server-side.
 *
 * Server-only by construction (Route Handler under `app/auth/`); the boundary
 * `rg` check in Step 11 confirms no `"use client"` module touches this code.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
    return NextResponse.redirect(
      new URL(
        `/auth/sign-in?error=${encodeURIComponent(error.message)}`,
        url.origin,
      ),
    );
  }

  return NextResponse.redirect(
    new URL("/auth/sign-in?error=missing_code", url.origin),
  );
}
