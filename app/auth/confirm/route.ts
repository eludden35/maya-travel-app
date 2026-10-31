import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { forgetSignIn, readNextPath } from "@/lib/auth-flow";
import { createClient } from "@/lib/supabase/server";

/**
 * Sign-in link from the email (template: supabase/templates/sign-in.html).
 * Verifies the one-time `token_hash` server-side and sets the session
 * cookie. Unlike the PKCE `?code=` link handled by /auth/callback, it works
 * in any browser on any device.
 */

const LINK_TYPES: ReadonlySet<string> = new Set(["email", "magiclink", "signup"]);

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  if (!tokenHash || !type || !LINK_TYPES.has(type)) {
    return NextResponse.redirect(
      new URL("/auth/sign-in?error=link_invalid", url.origin),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as EmailOtpType,
  });

  if (error) {
    console.error("auth confirm failed", error.status, error.code);
    return NextResponse.redirect(
      new URL("/auth/sign-in?error=link_invalid", url.origin),
    );
  }

  // Lands where the user started only if they opened the email in the same
  // browser; otherwise the remembered path isn't there and they land on "/".
  const next = await readNextPath();
  await forgetSignIn();
  return NextResponse.redirect(new URL(next, url.origin));
}
