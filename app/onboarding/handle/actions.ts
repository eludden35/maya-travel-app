"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createProfile } from "@/lib/profiles";
import { RATE_LIMITS, withRateLimit } from "@/lib/rate-limit";
import { acceptCurrentTos } from "@/lib/tos";

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
 *
 * ToS gate (Bead tripplanner-s3a.24): the action validates the
 * `tos_accepted` checkbox BEFORE doing anything else. Missing / unchecked
 * short-circuits to `?error=tos_required` without consuming a rate-limit
 * slot or creating a profile. After `createProfile` succeeds, the action
 * records an acceptance row via `acceptCurrentTos()`, separately rate-
 * limited under `RATE_LIMITS.TOS_ACCEPT`. The acceptance write happens
 * BEFORE the success redirect so that any failure surfaces here rather
 * than in a half-onboarded state. The masked IP and truncated user-agent
 * are computed inside `lib/tos.ts`; we just hand it the raw header values
 * so the masking lives in one testable place.
 */
export async function submitHandleAction(formData: FormData) {
  const handleRaw = formData.get("handle");
  const displayNameRaw = formData.get("display_name");
  const tosAcceptedRaw = formData.get("tos_accepted");

  const handle = typeof handleRaw === "string" ? handleRaw : "";
  const displayName = typeof displayNameRaw === "string" ? displayNameRaw : "";

  // Browsers send `tos_accepted=on` only when the checkbox is checked;
  // anything else (including missing, "off", or any other string from a
  // scripted client) fails the gate. Done before withRateLimit so a bot
  // probing the surface without the checkbox cannot exhaust a real user's
  // HANDLE_CREATE budget.
  if (tosAcceptedRaw !== "on") {
    redirect("/onboarding/handle?error=tos_required");
  }

  const limited = await withRateLimit(RATE_LIMITS.HANDLE_CREATE, () =>
    createProfile({ handle, displayName }),
  );

  if (!limited.ok) {
    // withRateLimit failed before createProfile ran. The error codes here
    // are a strict superset of CreateProfileResult's error codes, and every
    // code we redirect with is mapped in errorMessageFor() in page.tsx.
    redirect(`/onboarding/handle?error=${limited.error}`);
  }

  const result = limited.value;
  if (!result.ok) {
    redirect(`/onboarding/handle?error=${result.error}`);
  }

  // Profile insert succeeded. Record the ToS acceptance row before the
  // success redirect so we never leave a profile without a matching
  // acceptance audit row in the pre-Phase-2 window.
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  // x-forwarded-for is comma-separated when proxies have chained it; the
  // left-most entry is the original client IP. lib/tos.ts masks before
  // storage, so the raw value never reaches the DB.
  const ip = forwardedFor ? (forwardedFor.split(",")[0]?.trim() ?? null) : null;
  const userAgent = headerList.get("user-agent");

  const tosLimited = await withRateLimit(RATE_LIMITS.TOS_ACCEPT, () =>
    acceptCurrentTos({ ip, userAgent }),
  );

  if (!tosLimited.ok) {
    redirect(`/onboarding/handle?error=${tosLimited.error}`);
  }

  const acceptResult = tosLimited.value;
  if (!acceptResult.ok) {
    redirect(`/onboarding/handle?error=${acceptResult.error}`);
  }

  redirect("/");
}
