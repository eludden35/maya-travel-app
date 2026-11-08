import "server-only";

import type { Database } from "@/database.types";
import { DataAccessError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { isIsoDate, type TripDetails } from "@/lib/trip-fields";

/**
 * Server-only Trip helpers. Reads arrived with tripplanner-s3a.3; writes with
 * tripplanner-718.
 *
 * Every write goes through an RPC in
 * `supabase/migrations/20261102180000_trip_lifecycle.sql`. Clients have no
 * INSERT, UPDATE or DELETE on `trips` or `trip_members`. Each RPC checks who
 * is calling, validates, charges the `trip_create` or `trip_write` rate limit
 * in the same transaction, and answers with a status that the write helpers
 * below turn into a result union. Creating a trip adds the organizer's
 * `trip_members` row through a database trigger; other members join by
 * accepting an invite (tripplanner-2o5.1).
 *
 * Read helpers throw `DataAccessError` when a query fails, so an outage
 * shows the error page instead of "no trips yet".
 *
 * Why server-only: the helpers issue authenticated Supabase calls under
 * the caller's session cookie, which means RLS still applies. Pulling
 * these into the browser would either require shipping the secret key
 * (forbidden) or re-implementing RLS in the client (worse). See
 * `.cursor/rules/supabase-security.mdc`.
 *
 * Money-privacy note (ADR 0002): RLS exposes trip metadata only. Monetary
 * tables, when they ship, get their own member-only RLS that does not
 * consult `trips.visibility`. `trips.currency` names the unit a trip's
 * amounts are kept in; it is not an amount.
 */

export type TripVisibility = Database["public"]["Enums"]["trip_visibility"];
export type TripMemberRole = Database["public"]["Enums"]["trip_member_role"];

export type Trip = Database["public"]["Tables"]["trips"]["Row"];
export type TripMember = Database["public"]["Tables"]["trip_members"]["Row"];
export type TripMemberWithProfile =
  Database["public"]["Functions"]["get_trip_members"]["Returns"][number];

export type TripWithMemberCount = Trip & { memberCount: number };

export type GetTripResult =
  | { ok: true; trip: Trip }
  | { ok: false; error: "not_found" | "unauthorized" | "unknown" };

type TripDetailsError = "invalid_name" | "invalid_description" | "invalid_dates";

export type CreateTripResult =
  | { ok: true; tripId: string }
  | {
      ok: false;
      error:
        | TripDetailsError
        | "invalid_currency"
        | "rate_limited"
        | "unauthorized"
        | "unknown";
    };

export type UpdateTripResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | TripDetailsError
        | "not_found"
        | "forbidden"
        | "rate_limited"
        | "unauthorized"
        | "unknown";
    };

export type DeleteTripResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "not_found"
        | "forbidden"
        | "unsettled_balance"
        | "rate_limited"
        | "unauthorized"
        | "unknown";
    };

export type LeaveTripResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "not_found"
        | "organizer_cannot_leave"
        | "unsettled_balance"
        | "rate_limited"
        | "unauthorized"
        | "unknown";
    };

export type RemoveTripMemberResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "not_found"
        | "forbidden"
        | "not_a_member"
        | "cannot_remove_organizer"
        | "unsettled_balance"
        | "rate_limited"
        | "unauthorized"
        | "unknown";
    };

const DEFAULT_LIMIT = 20;

/**
 * List trips the viewer is a member of, most recent first.
 *
 * Two-step query, mirrors `lib/profiles.ts` `listDiscoverableProfilesExcluding`:
 *   1. select trip_id from trip_members where profile_id = viewerId  (RLS-filtered)
 *   2. select * from trips where id in (...) order by created_at desc
 *   3. select trip_id, count(*) from trip_members where trip_id in (...) group by trip_id
 *      — merged into the trip rows in TS. RLS only exposes member rows of
 *      trips the viewer can already see, which means the count is always
 *      truthful for the trips this helper returns.
 *
 * Cheap at MVP volumes (single-digit trips per user). If/when a user is
 * in hundreds of trips, swap to a denormalized `trips.member_count`
 * column maintained by triggers (file as a follow-up Bead).
 *
 * Block check is intentionally NOT applied here: the viewer is already a
 * member of every returned trip, so they can already see the organizer.
 * Block-check on the explore-side trips listing is `s3a.11`'s territory
 * (mirrors the `excludeIds` pattern from `lib/profiles.ts`).
 */
export async function listTripsForViewer(
  viewerId: string,
  opts?: { limit?: number },
): Promise<TripWithMemberCount[]> {
  const limit = opts?.limit ?? DEFAULT_LIMIT;
  const supabase = await createClient();

  const { data: memberships, error: membershipsError } = await supabase
    .from("trip_members")
    .select("trip_id")
    .eq("profile_id", viewerId);

  if (membershipsError) {
    throw new DataAccessError("listTripsForViewer memberships", membershipsError);
  }
  if (!memberships || memberships.length === 0) {
    return [];
  }

  const tripIds = memberships.map((m) => m.trip_id);

  const { data: trips, error: tripsError } = await supabase
    .from("trips")
    .select("*")
    .in("id", tripIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (tripsError) {
    throw new DataAccessError("listTripsForViewer trips", tripsError);
  }
  if (!trips || trips.length === 0) {
    return [];
  }

  const visibleTripIds = trips.map((t) => t.id);

  const { data: memberRows, error: memberRowsError } = await supabase
    .from("trip_members")
    .select("trip_id")
    .in("trip_id", visibleTripIds);

  if (memberRowsError) {
    throw new DataAccessError("listTripsForViewer member counts", memberRowsError);
  }

  const counts = new Map<string, number>();
  for (const row of memberRows ?? []) {
    counts.set(row.trip_id, (counts.get(row.trip_id) ?? 0) + 1);
  }

  return trips.map((trip) => ({
    ...trip,
    memberCount: counts.get(trip.id) ?? 0,
  }));
}

/**
 * Single-trip read through the `get_trip` RPC: public and unlisted trips for
 * anyone holding the id, private trips for their members. Table reads no
 * longer return unlisted trips (they could be listed by anyone), so this is
 * the only way to open one. Returns `null` when the trip doesn't exist or
 * isn't visible to the caller.
 */
export async function getTripById(tripId: string): Promise<Trip | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("get_trip", { p_trip_id: tripId })
    .maybeSingle();

  if (error) {
    throw new DataAccessError("getTripById", error);
  }
  return data;
}

/**
 * Members of a trip with their handles and display names, organizer first,
 * through the `get_trip_members` RPC. Returns `[]` unless the viewer is a
 * member: even on a public trip the membership list is members-only. A block
 * between two members doesn't hide either name here (founder decision,
 * 2026-11-02); outside the trip, profile RLS still applies it.
 */
export async function getTripMembers(
  tripId: string,
): Promise<TripMemberWithProfile[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_trip_members", {
    p_trip_id: tripId,
  });

  if (error) {
    throw new DataAccessError("getTripMembers", error);
  }
  return data ?? [];
}

/**
 * Membership existence check. Used by future modules (e.g. the shared-trip
 * leg of `can_dm()` in `s3a.13`). Same shape as `isFollowing` in
 * `lib/follows.ts`.
 */
export async function isTripMember(
  tripId: string,
  profileId: string,
): Promise<boolean> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("trip_members")
    .select("*", { count: "exact", head: true })
    .eq("trip_id", tripId)
    .eq("profile_id", profileId);

  if (error) {
    throw new DataAccessError("isTripMember", error);
  }
  return (count ?? 0) > 0;
}

/**
 * Create a private trip in `currency` with the caller as organizer. Trips
 * are private in UAT-1; the visibility enum stays for later rounds.
 */
export async function createTrip(
  details: TripDetails,
  currency: string,
): Promise<CreateTripResult> {
  if (!hasValidDates(details)) {
    return { ok: false, error: "invalid_dates" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_trip", {
      p_name: details.name,
      p_currency: currency,
      p_description: details.description ?? undefined,
      p_start_date: details.startDate ?? undefined,
      p_end_date: details.endDate ?? undefined,
    })
    .single();

  if (!error && data?.status === "ok" && data.trip_id) {
    return { ok: true, tripId: data.trip_id };
  }
  return toFailure(
    "createTrip",
    data?.status ?? null,
    error,
    CREATE_TRIP_ERRORS,
  );
}

/**
 * Replace a trip's editable details (organizer only). A `null` description or
 * date clears it. The currency never changes.
 */
export async function updateTrip(
  tripId: string,
  details: TripDetails,
): Promise<UpdateTripResult> {
  if (!hasValidDates(details)) {
    return { ok: false, error: "invalid_dates" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_trip", {
    p_trip_id: tripId,
    p_name: details.name,
    p_description: details.description ?? undefined,
    p_start_date: details.startDate ?? undefined,
    p_end_date: details.endDate ?? undefined,
  });

  return toResult("updateTrip", data, error, UPDATE_TRIP_ERRORS);
}

/** Delete a trip and everything in it (organizer only). */
export async function deleteTrip(tripId: string): Promise<DeleteTripResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_trip", {
    p_trip_id: tripId,
  });
  return toResult("deleteTrip", data, error, DELETE_TRIP_ERRORS);
}

/** Leave a trip. The organizer can't: they stay until the trip is deleted. */
export async function leaveTrip(tripId: string): Promise<LeaveTripResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("leave_trip", {
    p_trip_id: tripId,
  });
  return toResult("leaveTrip", data, error, LEAVE_TRIP_ERRORS);
}

/** Remove someone from a trip (organizer only; never the organizer). */
export async function removeTripMember(
  tripId: string,
  profileId: string,
): Promise<RemoveTripMemberResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_trip_member", {
    p_trip_id: tripId,
    p_profile_id: profileId,
  });
  return toResult("removeTripMember", data, error, REMOVE_TRIP_MEMBER_ERRORS);
}

type Failure<R> = R extends { ok: false; error: infer E } ? E : never;

const CREATE_TRIP_ERRORS: readonly Failure<CreateTripResult>[] = [
  "invalid_name",
  "invalid_description",
  "invalid_dates",
  "invalid_currency",
  "rate_limited",
  "unauthorized",
];
const UPDATE_TRIP_ERRORS: readonly Failure<UpdateTripResult>[] = [
  "invalid_name",
  "invalid_description",
  "invalid_dates",
  "not_found",
  "forbidden",
  "rate_limited",
  "unauthorized",
];
const DELETE_TRIP_ERRORS: readonly Failure<DeleteTripResult>[] = [
  "not_found",
  "forbidden",
  "unsettled_balance",
  "rate_limited",
  "unauthorized",
];
const LEAVE_TRIP_ERRORS: readonly Failure<LeaveTripResult>[] = [
  "not_found",
  "organizer_cannot_leave",
  "unsettled_balance",
  "rate_limited",
  "unauthorized",
];
const REMOVE_TRIP_MEMBER_ERRORS: readonly Failure<RemoveTripMemberResult>[] = [
  "not_found",
  "forbidden",
  "not_a_member",
  "cannot_remove_organizer",
  "unsettled_balance",
  "rate_limited",
  "unauthorized",
];

/** Browsers send valid yyyy-mm-dd dates; anything else never reaches Postgres. */
function hasValidDates(details: TripDetails): boolean {
  return [details.startDate, details.endDate].every(
    (date) => date === null || isIsoDate(date),
  );
}

/** Turn a status-returning trip RPC's answer into a result union. */
function toResult<E extends string>(
  operation: string,
  status: string | null,
  error: { code?: string; message: string } | null,
  known: readonly E[],
): { ok: true } | { ok: false; error: E | "unknown" } {
  if (!error && status === "ok") {
    return { ok: true };
  }
  return toFailure(operation, status, error, known);
}

/**
 * A status the caller knows about passes through. A transport error, or a
 * status this module doesn't know yet (a newer migration's), becomes
 * "unknown" and is logged; raw database text never reaches the UI.
 */
function toFailure<E extends string>(
  operation: string,
  status: string | null,
  error: { code?: string; message: string } | null,
  known: readonly E[],
): { ok: false; error: E | "unknown" } {
  if (error) {
    console.error(`${operation} failed`, error.code, error.message);
    return { ok: false, error: "unknown" };
  }
  const match = known.find((candidate) => candidate === status);
  if (match) {
    return { ok: false, error: match };
  }
  console.error(`${operation} returned an unexpected status`, status);
  return { ok: false, error: "unknown" };
}
