"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  deleteBlockedCopy,
  leaveBlockedCopy,
  removeBlockedCopy,
  type MemberBalance,
} from "@/app/_actions/unsettled-balance-copy";
import { isCurrencyCode } from "@/lib/money";
import { getCurrentProfile } from "@/lib/profiles";
import { getTripBalances } from "@/lib/settlements";
import { readTripCurrency, readTripDetails } from "@/lib/trip-fields";
import {
  createTrip,
  deleteTrip,
  getTripById,
  getTripMembers,
  leaveTrip,
  removeTripMember,
  updateTrip,
} from "@/lib/trips";
import { isUuid } from "@/lib/uuid";

/**
 * Server Action wrappers for the trip lifecycle (Bead tripplanner-718).
 *
 * Same shape as `app/_actions/follows-actions.ts`: the `"use server"`
 * boundary, `revalidatePath` and redirects live here so `lib/trips.ts` stays
 * a plain data layer, and ids from the client are checked with `isUuid`
 * before anything reaches the database.
 *
 * Rate limiting happens inside each RPC (`trip_create` / `trip_write`), in
 * the same transaction as the write, so these wrappers don't call
 * `withRateLimit`: a direct API call can't skip the RPC's charge, and
 * wrapping it as well would charge twice.
 *
 * The actions answer `useActionState` with copy rather than codes. Every
 * message is written here, or in `unsettled-balance-copy.ts` beside this
 * file; no database text reaches the browser. The confirm actions (delete,
 * leave, remove) need neither the previous state nor form fields: the page
 * binds the ids.
 */

export type TripFormField = "name" | "description" | "dates" | "currency";

export type TripFormState = {
  error: { field: TripFormField | null; message: string } | null;
};

export type ConfirmState = { error: string | null };

export async function createTripAction(
  _previous: TripFormState,
  formData: FormData,
): Promise<TripFormState> {
  const result = await createTrip(
    readTripDetails(formData),
    readTripCurrency(formData),
  );
  if (!result.ok) {
    return { error: formError(result.error) };
  }
  revalidatePath("/");
  redirect(`/trips/${result.tripId}`);
}

export async function updateTripAction(
  tripId: string,
  _previous: TripFormState,
  formData: FormData,
): Promise<TripFormState> {
  if (!isUuid(tripId)) {
    return { error: formError("not_found") };
  }
  const result = await updateTrip(tripId, readTripDetails(formData));
  if (!result.ok) {
    return { error: formError(result.error) };
  }
  revalidatePath("/");
  revalidatePath(`/trips/${tripId}`);
  redirect(`/trips/${tripId}`);
}

export async function deleteTripAction(
  tripId: string,
): Promise<ConfirmState> {
  if (!isUuid(tripId)) {
    return { error: CONFIRM_COPY.not_found };
  }
  const result = await deleteTrip(tripId);
  if (!result.ok) {
    return {
      error:
        result.error === "unsettled_balance"
          ? await deleteBlockedMessage(tripId)
          : CONFIRM_COPY[result.error],
    };
  }
  revalidatePath("/");
  redirect("/");
}

export async function leaveTripAction(
  tripId: string,
): Promise<ConfirmState> {
  if (!isUuid(tripId)) {
    return { error: CONFIRM_COPY.not_found };
  }
  const result = await leaveTrip(tripId);
  if (!result.ok) {
    return {
      error:
        result.error === "unsettled_balance"
          ? await leaveBlockedMessage(tripId)
          : CONFIRM_COPY[result.error],
    };
  }
  revalidatePath("/");
  redirect("/");
}

export async function removeTripMemberAction(
  tripId: string,
  profileId: string,
): Promise<ConfirmState> {
  if (!isUuid(tripId) || !isUuid(profileId)) {
    return { error: CONFIRM_COPY.not_found };
  }
  const result = await removeTripMember(tripId, profileId);
  // Someone who already left is gone either way.
  if (!result.ok && result.error !== "not_a_member") {
    return {
      error:
        result.error === "unsettled_balance"
          ? await removeBlockedMessage(tripId, profileId)
          : CONFIRM_COPY[result.error],
    };
  }
  revalidatePath("/");
  revalidatePath(`/trips/${tripId}`);
  return { error: null };
}

/**
 * The numbers behind an `unsettled_balance` refusal. They only make the
 * message more useful, so if a read fails the message goes without them.
 */
async function settleUpFacts(tripId: string) {
  try {
    const [balances, trip, members, viewer] = await Promise.all([
      getTripBalances(tripId),
      getTripById(tripId),
      getTripMembers(tripId),
      getCurrentProfile(),
    ]);
    return {
      balances,
      members,
      viewerId: viewer?.id ?? null,
      currency: trip && isCurrencyCode(trip.currency) ? trip.currency : null,
    };
  } catch (error) {
    console.error("settleUpFacts failed", error);
    return null;
  }
}

type SettleUpFacts = NonNullable<Awaited<ReturnType<typeof settleUpFacts>>>;

function balanceOf(
  facts: SettleUpFacts | null,
  memberId: string | null,
): MemberBalance | null {
  const balance = facts?.balances.find((row) => row.memberId === memberId);
  return balance && facts?.currency
    ? { amount: balance.amount, currency: facts.currency }
    : null;
}

async function leaveBlockedMessage(tripId: string): Promise<string> {
  const facts = await settleUpFacts(tripId);
  return leaveBlockedCopy(balanceOf(facts, facts?.viewerId ?? null));
}

async function removeBlockedMessage(
  tripId: string,
  profileId: string,
): Promise<string> {
  const facts = await settleUpFacts(tripId);
  const name =
    facts?.members.find((member) => member.profile_id === profileId)
      ?.display_name ?? null;
  return removeBlockedCopy(name, balanceOf(facts, profileId));
}

async function deleteBlockedMessage(tripId: string): Promise<string> {
  const facts = await settleUpFacts(tripId);
  if (!facts) {
    return deleteBlockedCopy(null, null);
  }
  const unsettled = facts.members.flatMap((member) => {
    const amount = balanceOf(facts, member.profile_id)?.amount ?? 0;
    return amount === 0
      ? []
      : [
          {
            name: member.display_name,
            isViewer: member.profile_id === facts.viewerId,
            amount,
          },
        ];
  });
  return deleteBlockedCopy(unsettled, facts.currency);
}

const SHARED_COPY = {
  not_found: "This trip isn't available anymore.",
  forbidden: "Only the organizer can do that.",
  rate_limited:
    "That's a lot of trip changes for one hour. Try again in a little while.",
  unauthorized: "Your session ended. Sign in again to keep going.",
  unknown: "Something went wrong. Please try again.",
} as const;

const CONFIRM_COPY = {
  ...SHARED_COPY,
  organizer_cannot_leave:
    "You organize this trip, so you stay until it's deleted.",
  cannot_remove_organizer: "The organizer can't be removed from their trip.",
  not_a_member: "They're no longer in this trip.",
} as const;

function formError(
  code:
    | keyof typeof SHARED_COPY
    | "invalid_name"
    | "invalid_description"
    | "invalid_dates"
    | "invalid_currency",
): NonNullable<TripFormState["error"]> {
  switch (code) {
    case "invalid_name":
      return {
        field: "name",
        message: "Give the trip a name: one line, up to 120 characters.",
      };
    case "invalid_description":
      return {
        field: "description",
        message: "Keep the description under 2,000 characters.",
      };
    case "invalid_dates":
      return {
        field: "dates",
        message: "Check the dates: the trip can't end before it starts.",
      };
    case "invalid_currency":
      return { field: "currency", message: "Pick one of the listed currencies." };
    default:
      return { field: null, message: SHARED_COPY[code] };
  }
}
