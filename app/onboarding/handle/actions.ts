"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { completeOnboarding } from "@/lib/profiles";

/**
 * Server Action wrapper for the onboarding form.
 *
 * Pulls formData fields, calls `completeOnboarding`, and either redirects to
 * `/` (success) or back to `/onboarding/handle` with an `?error=` code that
 * the page reads to render the error state.
 *
 * The error codes are deliberately enum-like (not raw error messages) so the
 * page can render localized copy and so we never reflect untrusted strings
 * back into the URL.
 *
 * `completeOnboarding` calls the `complete_onboarding` RPC, which in one
 * transaction checks the invite-only allow-list, validates the handle,
 * charges the `handle_create` rate limit (5 per hour — Bead
 * tripplanner-s3a.14), inserts the profile, and records the ToS acceptance
 * (Bead tripplanner-s3a.24). Nothing is half-written if any step fails.
 *
 * ToS gate: the action validates the `tos_accepted` checkbox BEFORE calling
 * the RPC, so a missing / unchecked box short-circuits to
 * `?error=tos_required` without consuming a rate-limit slot. The masked IP
 * and truncated user-agent are computed in `lib/tos.ts`; we just hand over
 * the raw header values so the masking lives in one testable place.
 */
export async function submitHandleAction(formData: FormData) {
  const handleRaw = formData.get("handle");
  const displayNameRaw = formData.get("display_name");
  const tosAcceptedRaw = formData.get("tos_accepted");

  const handle = typeof handleRaw === "string" ? handleRaw : "";
  const displayName = typeof displayNameRaw === "string" ? displayNameRaw : "";

  // Browsers send `tos_accepted=on` only when the checkbox is checked;
  // anything else (including missing, "off", or any other string from a
  // scripted client) fails the gate.
  if (tosAcceptedRaw !== "on") {
    redirect("/onboarding/handle?error=tos_required");
  }

  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  // x-forwarded-for is comma-separated when proxies have chained it; the
  // left-most entry is the original client IP. lib/tos.ts masks before
  // storage, so the raw value never reaches the DB.
  const ip = forwardedFor ? (forwardedFor.split(",")[0]?.trim() ?? null) : null;
  const userAgent = headerList.get("user-agent");

  const result = await completeOnboarding({
    handle,
    displayName,
    ip,
    userAgent,
  });

  if (!result.ok && result.error !== "already_onboarded") {
    redirect(`/onboarding/handle?error=${result.error}`);
  }

  redirect("/");
}
