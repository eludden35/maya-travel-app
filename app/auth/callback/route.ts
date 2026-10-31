import { NextResponse, type NextRequest } from "next/server";

import { forgetSignIn, readNextPath } from "@/lib/auth-flow";
import { safeNextPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * PKCE callback: exchanges `?code=` for a session cookie. Used by the
 * default Supabase email template (before the project's template is updated
 * to supabase/templates/sign-in.html) and by future OAuth providers. Only
 * works in the browser that requested the sign-in.
 *
 * `next` must be a same-origin path; anything else lands on "/".
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      new URL("/auth/sign-in?error=missing_code", url.origin),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("auth callback failed", error.status, error.code);
    return NextResponse.redirect(
      new URL("/auth/sign-in?error=link_invalid", url.origin),
    );
  }

  const next = url.searchParams.has("next")
    ? safeNextPath(url.searchParams.get("next"))
    : await readNextPath();
  await forgetSignIn();
  return NextResponse.redirect(new URL(next, url.origin));
}
