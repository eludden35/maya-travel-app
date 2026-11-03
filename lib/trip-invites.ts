import "server-only";

import type { Database } from "@/database.types";
import { DataAccessError } from "@/lib/errors";
import { toFailure, toResult } from "@/lib/rpc-result";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { isInviteToken, type InviteSettings } from "@/lib/trip-invite-fields";

/**
 * Server-only invite-link helpers (Bead tripplanner-2o5.1).
 *
 * Every write goes through an RPC in
 * `supabase/migrations/20261103200000_trip_invites.sql`. Each checks who is
 * calling, validates, charges `trip_invite` or `trip_join` in the same
 * transaction and answers with a status, which these helpers turn into a
 * result union. Only a trip's organizer can read its links (RLS), so a token
 * never reaches anyone else's page.
 *
 * A token is a bearer secret, like a password that lets someone into a trip:
 * it is never logged, and the only URL it appears in is the link itself.
 * `app/join/[token]/route.ts` moves it into a cookie after one hop (see
 * `rememberInvite` in `lib/auth-flow.ts`).
 */

export type TripInvite = Pick<
  Database["public"]["Tables"]["trip_invites"]["Row"],
  "id" | "token" | "created_at" | "expires_at" | "max_uses" | "uses" | "revoked_at"
>;

/** What a link invites to: never members, posts or amounts. */
export type TripInvitePreview = {
  /** Set only when the viewer is already in the trip. */
  tripId: string | null;
  tripName: string;
  startDate: string | null;
  endDate: string | null;
  organizerDisplayName: string;
  memberCount: number;
};

type InviteWriteError = "not_found" | "forbidden" | "rate_limited" | "unauthorized";

export type CreateTripInviteResult =
  | { ok: true }
  | {
      ok: false;
      error: InviteWriteError | "invalid_expiry" | "invalid_max_uses" | "unknown";
    };

export type RevokeTripInviteResult =
  | { ok: true }
  | { ok: false; error: InviteWriteError | "unknown" };

export type AcceptTripInviteResult =
  | { ok: true; tripId: string }
  | {
      ok: false;
      error:
        | "invalid"
        | "expired"
        | "revoked"
        | "full"
        | "rate_limited"
        | "unauthorized"
        | "unknown";
    };

/** The link people open. Built on SITE_URL, never on request headers. */
export function inviteUrl(token: string): string {
  return `${getSiteUrl()}/join/${token}`;
}

/**
 * A trip's newest link, live or not, so the organizer's panel can show it or
 * say why it stopped. `null` when there's none, and for anyone but the
 * organizer (RLS). A new link turns the old one off, so a live link is
 * always the newest.
 */
export async function getNewestTripInvite(
  tripId: string,
): Promise<TripInvite | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("trip_invites")
    .select("id, token, created_at, expires_at, max_uses, uses, revoked_at")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new DataAccessError("getNewestTripInvite", error);
  }
  return data;
}

/**
 * What a link invites to, through the `get_trip_invite_preview` RPC, for
 * anyone holding it, signed in or not. `null` for every link that isn't
 * working, whatever the reason, and when the viewer and someone in the trip
 * have blocked each other: the answers look alike on purpose.
 */
export async function getTripInvitePreview(
  token: string,
): Promise<TripInvitePreview | null> {
  if (!isInviteToken(token)) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("get_trip_invite_preview", { p_token: token })
    .maybeSingle();

  if (error) {
    throw new DataAccessError("getTripInvitePreview", error);
  }
  if (!data) {
    return null;
  }
  // The generated types can't tell that these columns may be null.
  return {
    tripId: data.trip_id ?? null,
    tripName: data.trip_name,
    startDate: data.start_date ?? null,
    endDate: data.end_date ?? null,
    organizerDisplayName: data.organizer_display_name,
    memberCount: data.member_count,
  };
}

/** A new link for the trip (organizer only). It replaces the current one. */
export async function createTripInvite(
  tripId: string,
  settings: InviteSettings,
): Promise<CreateTripInviteResult> {
  if (!Number.isInteger(settings.expiresInDays)) {
    return { ok: false, error: "invalid_expiry" };
  }
  if (!Number.isInteger(settings.maxUses)) {
    return { ok: false, error: "invalid_max_uses" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_trip_invite", {
      p_trip_id: tripId,
      p_expires_in_days: settings.expiresInDays,
      p_max_uses: settings.maxUses,
    })
    .single();

  return toResult(
    "createTripInvite",
    data?.status ?? null,
    error,
    CREATE_TRIP_INVITE_ERRORS,
  );
}

/** Turn a link off (organizer only). People who joined through it stay. */
export async function revokeTripInvite(
  inviteId: string,
): Promise<RevokeTripInviteResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revoke_trip_invite", {
    p_invite_id: inviteId,
  });
  return toResult("revokeTripInvite", data, error, REVOKE_TRIP_INVITE_ERRORS);
}

/**
 * Join the link's trip. Someone already in it gets `ok` with the trip id, so
 * this is safe to call twice, and after onboarding, which joins on its own.
 */
export async function acceptTripInvite(
  token: string,
): Promise<AcceptTripInviteResult> {
  if (!isInviteToken(token)) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("accept_trip_invite", { p_token: token })
    .single();

  if (
    !error &&
    (data?.status === "ok" || data?.status === "already_member") &&
    data.trip_id
  ) {
    return { ok: true, tripId: data.trip_id };
  }
  return toFailure(
    "acceptTripInvite",
    data?.status ?? null,
    error,
    ACCEPT_TRIP_INVITE_ERRORS,
  );
}

type Failure<R> = R extends { ok: false; error: infer E } ? E : never;

const CREATE_TRIP_INVITE_ERRORS: readonly Failure<CreateTripInviteResult>[] = [
  "not_found",
  "forbidden",
  "invalid_expiry",
  "invalid_max_uses",
  "rate_limited",
  "unauthorized",
];
const REVOKE_TRIP_INVITE_ERRORS: readonly Failure<RevokeTripInviteResult>[] = [
  "not_found",
  "forbidden",
  "rate_limited",
  "unauthorized",
];
const ACCEPT_TRIP_INVITE_ERRORS: readonly Failure<AcceptTripInviteResult>[] = [
  "invalid",
  "expired",
  "revoked",
  "full",
  "rate_limited",
  "unauthorized",
];
