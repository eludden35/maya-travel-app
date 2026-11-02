"use server";

import { redirect } from "next/navigation";

import {
  forgetSignIn,
  readNextPath,
  readSignInEmail,
  rememberSignIn,
} from "@/lib/auth-flow";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

/**
 * Email sign-in in two steps:
 *
 *   1. `requestSignInCode` — Supabase emails a 6-digit code plus a link
 *      (template: supabase/templates/sign-in.html).
 *   2. `verifySignInCode` — the user types the code and gets a session
 *      cookie. The emailed link goes through /auth/confirm instead.
 *
 * Both work on any device. The default PKCE "?code=" link only works in the
 * browser that asked for it, which fails whenever someone requests on a
 * laptop and opens the email on their phone. /auth/callback still handles
 * that link for projects whose email template hasn't been updated.
 *
 * Threat model (mini):
 * - Who can call this? Anyone (anon). Supabase rate-limits sends per
 *   address and verifications per IP.
 * - Requesting a code creates the auth user if needed. While Jettison is
 *   invite-only, onboarding refuses addresses not on the allow-list, so a
 *   stray account sees nothing.
 * - PII: the address is never logged and never put in a URL.
 * - The emailed links point at SITE_URL, never at a request header.
 */
export async function requestSignInCode(formData: FormData) {
  const resend = formData.get("resend") === "1";
  const emailRaw = resend ? await readSignInEmail() : formData.get("email");
  const email = typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : "";
  if (email.length === 0) {
    redirect(`/auth/sign-in?error=${resend ? "code_expired" : "missing_email"}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${getSiteUrl()}/auth/callback`,
      shouldCreateUser: true,
    },
  });

  if (error) {
    console.error("requestSignInCode failed", error.status, error.code);
    redirect(
      `/auth/sign-in?error=${error.status === 429 ? "rate_limited" : "send_failed"}`,
    );
  }

  const next = resend ? await readNextPath() : formData.get("next");
  await rememberSignIn(email, typeof next === "string" ? next : null);
  redirect("/auth/sign-in?step=code");
}

export async function verifySignInCode(formData: FormData) {
  const email = await readSignInEmail();
  if (!email) {
    redirect("/auth/sign-in?error=code_expired");
  }

  const codeRaw = formData.get("code");
  const code = typeof codeRaw === "string" ? codeRaw.replace(/\s+/g, "") : "";
  if (!/^\d{6,10}$/.test(code)) {
    redirect("/auth/sign-in?step=code&error=code_invalid");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });

  if (error) {
    console.error("verifySignInCode failed", error.status, error.code);
    redirect(
      `/auth/sign-in?step=code&error=${error.status === 429 ? "rate_limited" : "code_invalid"}`,
    );
  }

  const next = await readNextPath();
  await forgetSignIn();
  redirect(next);
}
