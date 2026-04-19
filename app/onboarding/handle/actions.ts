"use server";

import { redirect } from "next/navigation";

import { createProfile } from "@/lib/profiles";
import { RATE_LIMITS, withRateLimit } from "@/lib/rate-limit";

/**
 * Server Action wrapper for the onboarding form.
 *
 * Pulls formData fields, calls createProfile, and either redirects to `/`
 * (success) or back to `/onboarding/handle` with an `?error=` code that the
 * page reads to render the error state.
 *
 * The error codes are deliberately enum-like (not raw error messages) so the
 * page can render localized copy and so we never reflect untrusted strings
 * back into the URL.
 *
 * Wrapped in `withRateLimit(RATE_LIMITS.HANDLE_CREATE, ...)` per Bead
 * tripplanner-s3a.14: handle creation is currently the most attractive
 * squat-and-spam surface in the app (every successful insert burns a
 * globally-unique handle). The cap is intentionally low — five attempts
 * per hour is enough for a real human picking a name with typos and
 * second-guesses, and well under what a bot needs to be useful.
 */
export async function submitHandleAction(formData: FormData) {
  const handleRaw = formData.get("handle");
  const displayNameRaw = formData.get("display_name");

  const handle = typeof handleRaw === "string" ? handleRaw : "";
  const displayName = typeof displayNameRaw === "string" ? displayNameRaw : "";

  const limited = await withRateLimit(RATE_LIMITS.HANDLE_CREATE, () =>
    createProfile({ handle, displayName }),
  );

  if (limited.ok) {
    const result = limited.value;
    if (result.ok) {
      redirect("/");
    }
    redirect(`/onboarding/handle?error=${result.error}`);
  }

  // withRateLimit failed before createProfile ran. The error codes here are
  // a strict superset of CreateProfileResult's error codes, and every code
  // we redirect with is mapped in errorMessageFor() in page.tsx — keep the
  // two in sync (rate_limited was added with this chunk).
  redirect(`/onboarding/handle?error=${limited.error}`);
}
