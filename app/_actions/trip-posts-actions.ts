"use server";

import { revalidatePath } from "next/cache";

import type { ConfirmState } from "@/app/_actions/trips-actions";
import { readPostBody, readReport } from "@/lib/post-fields";
import {
  createTripPost,
  deleteTripPost,
  reportTripPost,
} from "@/lib/trip-posts";
import { isUuid } from "@/lib/uuid";

/**
 * Server Action wrappers for trip notes and reports (Bead tripplanner-2o5.6).
 *
 * Same shape as `app/_actions/trips-actions.ts`: ids from the client are
 * checked with `isUuid` before anything reaches the database, and every
 * message is written here, so no database text reaches the browser. The RPCs
 * charge their rate limits in the same transaction as the write, so these
 * wrappers don't call `withRateLimit`.
 *
 * The UI calls posts "notes": "Write a trip note", "Pin to trip".
 */

export type NoteFormState = {
  error: string | null;
  /** Counts successful posts, so the composer knows to clear itself. */
  posted: number;
};

export type ReportFormState = { error: string | null; reported: boolean };

export async function createTripPostAction(
  tripId: string,
  previous: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  if (!isUuid(tripId)) {
    return { ...previous, error: NOTE_COPY.not_found };
  }
  const result = await createTripPost(tripId, readPostBody(formData));
  if (!result.ok) {
    return { ...previous, error: NOTE_COPY[result.error] };
  }
  revalidatePath(`/trips/${tripId}`);
  return { error: null, posted: previous.posted + 1 };
}

export async function deleteTripPostAction(
  tripId: string,
  postId: string,
): Promise<ConfirmState> {
  if (!isUuid(tripId) || !isUuid(postId)) {
    return { error: DELETE_COPY.not_found };
  }
  const result = await deleteTripPost(postId);
  // A note that's already gone is gone either way.
  if (!result.ok && result.error !== "not_found") {
    return { error: DELETE_COPY[result.error] };
  }
  revalidatePath(`/trips/${tripId}`);
  return { error: null };
}

export async function reportTripPostAction(
  tripId: string,
  postId: string,
  _previous: ReportFormState,
  formData: FormData,
): Promise<ReportFormState> {
  if (!isUuid(tripId) || !isUuid(postId)) {
    return { error: REPORT_COPY.not_found, reported: false };
  }
  const { reason, note } = readReport(formData);
  const result = await reportTripPost(postId, reason, note);
  // Reporting twice lands where reporting once does.
  if (!result.ok && result.error !== "already_reported") {
    return { error: REPORT_COPY[result.error], reported: false };
  }
  revalidatePath(`/trips/${tripId}`);
  return { error: null, reported: true };
}

const SESSION_ENDED = "Your session ended. Sign in again to keep going.";

const NOTE_COPY = {
  not_found: "This trip isn't available anymore.",
  invalid_body: "Write something first: up to 2,000 characters.",
  rate_limited:
    "That's a lot of notes in a short time. Take a breath and try again a little later.",
  unauthorized: SESSION_ENDED,
  unknown: "Something went wrong, so the note wasn't pinned. Please try again.",
} as const;

const DELETE_COPY = {
  not_found: "This note isn't available anymore.",
  forbidden: "Only the person who wrote a note can delete it.",
  unauthorized: SESSION_ENDED,
  unknown: "Something went wrong. Please try again.",
} as const;

const REPORT_COPY = {
  not_found: "This note isn't available anymore.",
  own_post: "That's your own note. You can delete it instead.",
  invalid_reason: "Pick the reason that fits best.",
  invalid_note: "Keep the note under 500 characters.",
  rate_limited:
    "You've sent a lot of reports this hour. Try again in a little while.",
  unauthorized: SESSION_ENDED,
  unknown: "Something went wrong, so the report wasn't sent. Please try again.",
} as const;
