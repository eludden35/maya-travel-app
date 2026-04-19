"use server";

import { redirect } from "next/navigation";

import { createProfile } from "@/lib/profiles";

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
 */
export async function submitHandleAction(formData: FormData) {
  const handleRaw = formData.get("handle");
  const displayNameRaw = formData.get("display_name");

  const handle = typeof handleRaw === "string" ? handleRaw : "";
  const displayName = typeof displayNameRaw === "string" ? displayNameRaw : "";

  const result = await createProfile({ handle, displayName });

  if (result.ok) {
    redirect("/");
  }

  redirect(`/onboarding/handle?error=${result.error}`);
}
