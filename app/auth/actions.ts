"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Server Action: send a magic-link email to the supplied address.
 *
 * Magic link is the simplest auth flow that exists end-to-end without storing
 * a password. The user submits their email, Supabase emails them a link, the
 * link bounces through `/auth/callback?code=...` which exchanges the code for
 * a session cookie. After that, server components see `user`.
 *
 * Threat model (mini):
 * - Who can call this? Anyone (anon). Acceptable: it only sends email.
 * - What if rate-limited? Supabase enforces email rate limits per project.
 * - PII in logs? Email addresses can be PII; we redirect rather than logging.
 */
export async function signInWithMagicLink(formData: FormData) {
  const email = formData.get("email");
  if (typeof email !== "string" || email.length === 0) {
    redirect("/auth/sign-in?error=missing_email");
  }

  const headerList = await headers();
  const origin =
    headerList.get("origin") ??
    `https://${headerList.get("host") ?? "localhost:3000"}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    redirect(
      `/auth/sign-in?error=${encodeURIComponent(error.message)}`,
    );
  }

  redirect("/auth/sign-in?sent=1");
}
