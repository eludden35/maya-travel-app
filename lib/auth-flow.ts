import "server-only";

import { cookies } from "next/headers";

import { safeNextPath } from "@/lib/safe-redirect";

/**
 * State carried between the two sign-in steps (send code -> enter code) and
 * through the email round trip: the address the code went to, and where to
 * land afterwards. Both live in short-lived httpOnly cookies so neither ever
 * appears in a URL.
 */

const EMAIL_COOKIE = "jtsn_signin_email";
const NEXT_COOKIE = "jtsn_next";
const MAX_AGE_SECONDS = 15 * 60;

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
