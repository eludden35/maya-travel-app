/**
 * What the money screens say when the database refuses something (Bead
 * tripplanner-2o5.5). Each record is keyed by every status the data layer can
 * return, so a new status doesn't compile until it has words. It lives beside
 * `trip-money-actions.ts` because every export of a `"use server"` file
 * becomes an action.
 */

const SESSION_ENDED = "Your session ended. Sign in again to keep going.";

export const EXPENSE_COPY = {
  invalid_description: "Say what it was: one line, up to 120 characters.",
  invalid_amount: "Enter an amount from 0.01 up to 999,999,999.99.",
  invalid_shares: "Check the split: put at least one person in it.",
  not_a_member: "Someone in that split isn't in this trip now. Refresh and try again.",
  shares_mismatch: "Those shares don't add up to the amount yet.",
  not_found: "This cost isn't available anymore.",
  forbidden:
    "Only the person who paid, the person who added it or the organizer can change this cost.",
  member_left: "Someone on this cost has left the trip, so it stays as it is.",
  rate_limited:
    "That's a lot of cost changes for one hour. Try again in a little while.",
  unauthorized: SESSION_ENDED,
  unknown: "Something went wrong, so that wasn't saved. Please try again.",
} as const;

export const RECORD_PAYMENT_COPY = {
  invalid_amount: "Enter an amount from 0.01 up to 999,999,999.99.",
  same_member: "A payment needs two people. Pick someone else.",
  forbidden: "Only the two people in a payment can mark it as paid.",
  not_a_member: "One of you isn't in this trip now, so this can't be marked here.",
  not_found: "This trip isn't available anymore.",
  rate_limited:
    "That's a lot of payments for one hour. Try again in a little while.",
  unauthorized: SESSION_ENDED,
  unknown: "Something went wrong, so that wasn't marked. Please try again.",
} as const;

export const VOID_PAYMENT_COPY = {
  not_found: "This payment isn't available anymore.",
  forbidden: "Only the two people in a payment can void it.",
  already_voided: "This payment has already been voided.",
  member_left: "One of you has left the trip, so this payment stays as it is.",
  rate_limited:
    "That's a lot of payments for one hour. Try again in a little while.",
  unauthorized: SESSION_ENDED,
  unknown: "Something went wrong, so it wasn't voided. Please try again.",
} as const;
