"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ConfirmState } from "@/app/_actions/trips-actions";
import { forgetInvite, readInviteToken } from "@/lib/auth-flow";
import { readInviteSettings } from "@/lib/trip-invite-fields";
import {
  acceptTripInvite,
  createTripInvite,
  revokeTripInvite,
} from "@/lib/trip-invites";
import { isUuid } from "@/lib/uuid";

/**
 * Server Action wrappers for invite links (Bead tripplanner-2o5.1), shaped
 * like `app/_actions/trips-actions.ts`: ids from the client are checked with
 * `isUuid`, `revalidatePath` and redirects live here, and every message is
 * written here, so no database text reaches the browser.
 *
 * Rate limiting happens inside each RPC (`trip_invite`, `trip_join`), in the
 * same transaction as the write, so these wrappers don't charge again.
 *
 * Joining reads the token from the invite cookie, never from the form: the
 * token stays out of the page and out of the request.
 */

export type InviteFormState = { error: string | null };

export type JoinState = { error: string | null };

/** The organizer's create form. A new link replaces the current one. */
export async function createTripInviteAction(
  tripId: string,
  _previous: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  if (!isUuid(tripId)) {
    return { error: INVITE_COPY.not_found };
  }
  const result = await createTripInvite(tripId, readInviteSettings(formData));
  if (!result.ok) {
    return { error: INVITE_COPY[result.error] };
  }
  revalidatePath(`/trips/${tripId}`);
  return { error: null };
}

/** "New link": the same settings, a fresh token; the old link stops working. */
export async function replaceTripInviteAction(
  tripId: string,
  expiresInDays: number,
  maxUses: number,
): Promise<ConfirmState> {
  if (!isUuid(tripId)) {
    return { error: INVITE_COPY.not_found };
  }
  const result = await createTripInvite(tripId, { expiresInDays, maxUses });
  if (!result.ok) {
    return { error: INVITE_COPY[result.error] };
  }
  revalidatePath(`/trips/${tripId}`);
  return { error: null };
}

export async function revokeTripInviteAction(
  tripId: string,
  inviteId: string,
): Promise<ConfirmState> {
  if (!isUuid(tripId) || !isUuid(inviteId)) {
    return { error: INVITE_COPY.not_found };
  }
  const result = await revokeTripInvite(inviteId);
  if (!result.ok) {
    return { error: INVITE_COPY[result.error] };
  }
  revalidatePath(`/trips/${tripId}`);
  return { error: null };
}

/** The "Join trip" button on /join, for someone signed in and onboarded. */
export async function acceptTripInviteAction(): Promise<JoinState> {
  const token = await readInviteToken();
  if (!token) {
    return { error: JOIN_COPY.invalid };
  }
  const result = await acceptTripInvite(token);
  if (!result.ok) {
    return { error: JOIN_COPY[result.error] };
  }
  await forgetInvite();
  revalidatePath("/");
  redirect(`/trips/${result.tripId}`);
}

const INVITE_COPY = {
  not_found: "This trip isn't available anymore.",
  forbidden: "Only the organizer can change invite links.",
  invalid_expiry: "Pick how long the link should work.",
  invalid_max_uses: "Pick how many people the link can let in.",
  rate_limited:
    "That's a lot of link changes for one hour. Try again in a little while.",
  unauthorized: "Your session ended. Sign in again to keep going.",
  unknown: "Something went wrong. Please try again.",
} as const;

// After sign-in a dead link says why. Before it, /join gives one answer for
// every reason, and a block always reads as "invalid".
const JOIN_COPY = {
  invalid: "This invite no longer works. Ask whoever sent it for a new link.",
  expired: "This invite has expired. Ask the organizer for a new link.",
  revoked: "The organizer turned this link off. Ask them for a new one.",
  full: "Everyone this invite was for has joined. Ask the organizer for a new link.",
  rate_limited:
    "That's a lot of trips to join in one hour. Try again in a little while.",
  unauthorized: "Your session ended. Sign in again to keep going.",
  unknown: "Something went wrong. Please try again.",
} as const;
