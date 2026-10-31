import "server-only";

import type { Database } from "@/database.types";
import { DataAccessError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-only Trip read helpers (Bead tripplanner-s3a.3).
 *
 * No write helpers yet — trip create + update + leave land in
 * tripplanner-718 alongside the trip detail page and the
 * `app/_actions/trips-actions.ts` Server Action wrappers. Inserting a trip
 * adds the organizer's `trip_members` row via a database trigger; other
 * members will join by accepting an invite (no client inserts).
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
 * consult `trips.visibility`. Nothing in this module reads, writes, or
 * mentions monetary fields.
 */

export type TripVisibility = Database["public"]["Enums"]["trip_visibility"];
export type TripMemberRole = Database["public"]["Enums"]["trip_member_role"];

export type Trip = Database["public"]["Tables"]["trips"]["Row"];
export type TripMember = Database["public"]["Tables"]["trip_members"]["Row"];

export type TripWithMemberCount = Trip & { memberCount: number };

export type GetTripResult =
  | { ok: true; trip: Trip }
  | { ok: false; error: "not_found" | "unauthorized" | "unknown" };

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
 * Members of a trip the viewer can see. Returns `[]` if the viewer is not
 * a member (RLS filters the rows away — even on a public trip the
 * membership list is members-only).
 */
export async function getTripMembers(tripId: string): Promise<TripMember[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("trip_members")
    .select("*")
    .eq("trip_id", tripId);

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
