import { NextResponse, type NextRequest } from "next/server";

import { forgetInvite, rememberInvite } from "@/lib/auth-flow";
import { isInviteToken } from "@/lib/trip-invite-fields";

/**
 * An invite link, /join/<token> (Bead tripplanner-2o5.1).
 *
 * The token is a bearer secret, so it gets one hop: it moves into an
 * httpOnly cookie and the browser lands on /join, which shows the
 * invitation. After that the token isn't in the address bar, browser history,
 * any later URL or Referer header, or a Sentry event, and sign-in and
 * onboarding carry it without putting it in `next`. This request line is the
 * one place it's logged, which any link-based invite has. A redirect keeps
 * the page the link was opened from as the referrer, so the token never
 * becomes one. Nothing is read or written in the database here, so a chat
 * app fetching the link for a preview changes nothing.
 *
 * A token of the wrong shape clears any earlier invite, so /join gives the
 * same "no longer works" answer as for a link that died. `no-store` keeps the
 * response, and its Set-Cookie, out of shared caches.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (isInviteToken(token)) {
    await rememberInvite(token);
  } else {
    await forgetInvite();
  }

  const response = NextResponse.redirect(new URL("/join", request.url), 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
