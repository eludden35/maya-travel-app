import "server-only";

import { cookies } from "next/headers";

import { safeNextPath } from "@/lib/safe-redirect";
import { isInviteToken } from "@/lib/trip-invite-fields";

/**
 * State carried between the two sign-in steps (send code -> enter code) and
 * through the email round trip: the address the code went to, and where to
 * land afterwards. Both live in short-lived httpOnly cookies so neither ever
 * appears in a URL. The invite link being followed rides along the same way
 * (see `rememberInvite`).
 */

const EMAIL_COOKIE = "jtsn_signin_email";
const NEXT_COOKIE = "jtsn_next";
const MAX_AGE_SECONDS = 15 * 60;
const INVITE_COOKIE = "jtsn_invite";
const INVITE_MAX_AGE_SECONDS = 60 * 60;

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };
}

export async function rememberSignIn(email: string, next: string | null) {
  const store = await cookies();
  store.set(EMAIL_COOKIE, email, cookieOptions());
  store.set(NEXT_COOKIE, safeNextPath(next), cookieOptions());
}

export async function readSignInEmail(): Promise<string | null> {
  const store = await cookies();
  return store.get(EMAIL_COOKIE)?.value ?? null;
}

/** The validated post-sign-in path ("/" when none was remembered). */
export async function readNextPath(): Promise<string> {
  const store = await cookies();
  return safeNextPath(store.get(NEXT_COOKIE)?.value);
}

/** Call once a session exists. Server Actions and Route Handlers only. */
export async function forgetSignIn() {
  const store = await cookies();
  store.delete(EMAIL_COOKIE);
  store.delete(NEXT_COOKIE);
}

/**
 * The invite link being followed (Bead tripplanner-2o5.1). `/join/[token]`
 * stores its token here and redirects to `/join`, so the token leaves the
 * address bar, browser history and every later URL and Referer header after
 * one hop. Sign-in (`next=/join`) and onboarding read it from here. It lasts
 * an hour, like a sign-in code, and is cleared on joining and on sign-out.
 * Route Handlers and Server Actions only.
 */
export async function rememberInvite(token: string) {
  const store = await cookies();
  store.set(INVITE_COOKIE, token, {
    ...cookieOptions(),
    maxAge: INVITE_MAX_AGE_SECONDS,
  });
}

/** The token of the invite being followed, or `null`. */
export async function readInviteToken(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(INVITE_COOKIE)?.value;
  return isInviteToken(token) ? token : null;
}

/** Route Handlers and Server Actions only. */
export async function forgetInvite() {
  const store = await cookies();
  store.delete(INVITE_COOKIE);
}
