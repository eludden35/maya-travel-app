import "server-only";

import { redirect } from "next/navigation";

import type { Database } from "@/database.types";
import { DataAccessError } from "@/lib/errors";
import { CURRENT_TOS_VERSION } from "@/lib/legal";
import { createClient } from "@/lib/supabase/server";
import { maskIp, truncateUserAgent } from "@/lib/tos";

/**
 * Server-only Profile helpers.
 *
 * The Profile entity (Bead tripplanner-s3a.1) is the public identity row keyed
 * 1:1 to `auth.users`. New users sign in, then get gated to `/onboarding/handle`
 * by `requireProfile()` until they pick a handle and a display name.
 *
 * Profiles are created only by the `complete_onboarding` RPC, which writes
 * the profile and the ToS acceptance in one transaction (see
 * supabase/migrations/20261029120000_rls_hardening.sql). Clients have no
 * INSERT privilege on `profiles` and may UPDATE only display_name, bio and
 * is_discoverable.
 */

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export type DiscoverableProfile = Pick<
  ProfileRow,
  "id" | "handle" | "display_name" | "bio"
> & { isFollowing: boolean };

export type CompleteOnboardingResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "already_onboarded"
        | "invite_required"
        | "invalid_handle"
        | "invalid_display_name"
        | "invalid_tos_version"
        | "handle_taken"
        | "rate_limited"
        | "unauthorized"
        | "unknown";
    };

export type UpdateProfileResult =
  | { ok: true }
  | { ok: false; error: "invalid_display_name" | "invalid_bio" | "unauthorized" | "unknown" };

const DISPLAY_NAME_MIN = 1;
const DISPLAY_NAME_MAX = 50;
const BIO_MAX = 500;

const ONBOARDING_ERRORS = new Set<string>([
  "already_onboarded",
  "invite_required",
  "invalid_handle",
  "invalid_display_name",
  "invalid_tos_version",
  "handle_taken",
  "rate_limited",
  "unauthorized",
]);

/**
 * Fetch the Profile row for the currently authenticated user. Returns `null`
 * if the user is not signed in or has not completed onboarding, and throws
 * `DataAccessError` if the query itself fails.
 */
export async function getCurrentProfile(): Promise<ProfileRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new DataAccessError("getCurrentProfile", error);
  }
  return data;
}

/**
 * Authenticated server components call this at the top of their render to
 * enforce that the user has completed onboarding. Returns the Profile row if
 * present; otherwise redirects to `/onboarding/handle` and never returns.
 */
export async function requireProfile(): Promise<ProfileRow> {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/onboarding/handle");
  }
  return profile;
}

/**
 * `requireProfile` for pages people reach from a link, such as a trip: a
 * signed-out visitor goes to sign-in first, before anything on the page
 * loads, and lands back on `path` afterwards (the sign-in flow checks it
 * with `safeNextPath`).
 */
export async function requireProfileFor(path: string): Promise<ProfileRow> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth/sign-in?next=${encodeURIComponent(path)}`);
  }
  return requireProfile();
}

/**
 * Whether the signed-in user may finish onboarding while Jettison is
 * invite-only: their email is on `private.onboarding_allowlist`, or they hold
 * a live trip invite (tripplanner-2o5.1).
 */
export async function canCompleteOnboarding(
  inviteToken: string | null = null,
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("can_complete_onboarding", {
    p_invite_token: inviteToken ?? undefined,
  });
  if (error) {
    throw new DataAccessError("canCompleteOnboarding", error);
  }
  return data === true;
}

/**
 * Server Action body: create the current user's profile and record their
 * acceptance of `CURRENT_TOS_VERSION`, atomically, via `complete_onboarding`.
 * The RPC validates and rate-limits (`handle_create`); `ip` and `userAgent`
 * are the raw request header values and are masked here before they leave
 * the server. With a live `inviteToken` the RPC also joins that trip in the
 * same transaction, and lets in an email that isn't allow-listed.
 */
export async function completeOnboarding(input: {
  handle: string;
  displayName: string;
  ip: string | null;
  userAgent: string | null;
  inviteToken: string | null;
}): Promise<CompleteOnboardingResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("complete_onboarding", {
    p_handle: input.handle,
    p_display_name: input.displayName,
    p_tos_version: CURRENT_TOS_VERSION,
    p_ip: maskIp(input.ip) ?? undefined,
    p_user_agent: truncateUserAgent(input.userAgent) ?? undefined,
    p_invite_token: input.inviteToken ?? undefined,
  });

  if (error) {
    console.error("completeOnboarding failed", error.code, error.message);
    return { ok: false, error: "unknown" };
  }
  if (data === "ok") {
    return { ok: true };
  }
  if (typeof data === "string" && ONBOARDING_ERRORS.has(data)) {
    return {
      ok: false,
      error: data as Exclude<CompleteOnboardingResult, { ok: true }>["error"],
    };
  }
  console.error("completeOnboarding returned an unexpected status", data);
  return { ok: false, error: "unknown" };
}

/**
 * Server Action: update the current user's Profile row.
 *
 * Whitelisted columns: display_name, bio, is_discoverable — the same three
 * the database grants UPDATE on. Handles cannot change at MVP (reclaim/squat
 * hazard — own Bead); is_moderator is set only by an administrator.
 */
export async function updateProfile(input: {
  displayName?: string;
  bio?: string | null;
  isDiscoverable?: boolean;
}): Promise<UpdateProfileResult> {
  const patch: {
    display_name?: string;
    bio?: string | null;
    is_discoverable?: boolean;
  } = {};

  if (input.displayName !== undefined) {
    const displayName = input.displayName.trim();
    if (
      displayName.length < DISPLAY_NAME_MIN ||
      displayName.length > DISPLAY_NAME_MAX
    ) {
      return { ok: false, error: "invalid_display_name" };
    }
    patch.display_name = displayName;
  }

  if (input.bio !== undefined) {
    if (input.bio === null) {
      patch.bio = null;
    } else {
      const bio = input.bio.trim();
      if (bio.length > BIO_MAX) {
        return { ok: false, error: "invalid_bio" };
      }
      patch.bio = bio.length === 0 ? null : bio;
    }
  }

  if (input.isDiscoverable !== undefined) {
    patch.is_discoverable = input.isDiscoverable;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: true };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "unauthorized" };
  }

  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", user.id);

  if (error) {
    console.error("updateProfile failed", error.code, error.message);
    return { ok: false, error: "unknown" };
  }
  return { ok: true };
}

/**
 * List up to `limit` other discoverable profiles, annotated with whether the
 * given viewer already follows each one. Used by the home-page "People to
 * follow" section (Bead tripplanner-s3a.2). Two indexed queries merged in TS;
 * cheap at MVP volumes and avoids inventing a custom RPC.
 *
 * `opts.excludeIds` lets the caller filter out additional profile ids beyond
 * the viewer themselves — used by the home page to drop profiles the viewer
 * has blocked. Profiles that blocked the viewer are already hidden by RLS.
 */
export async function listDiscoverableProfilesExcluding(
  viewerId: string,
  limit: number,
  opts: { excludeIds?: string[] } = {},
): Promise<DiscoverableProfile[]> {
  const supabase = await createClient();

  const excludeIds = opts.excludeIds ?? [];

  let profilesQuery = supabase
    .from("profiles")
    .select("id, handle, display_name, bio")
    .eq("is_discoverable", true)
    .neq("id", viewerId);

  if (excludeIds.length > 0) {
    profilesQuery = profilesQuery.not(
      "id",
      "in",
      `(${excludeIds.join(",")})`,
    );
  }

  const { data: profiles, error: profilesError } = await profilesQuery
    .order("created_at", { ascending: false })
    .limit(limit);

  if (profilesError) {
    throw new DataAccessError("listDiscoverableProfilesExcluding", profilesError);
  }
  if (!profiles || profiles.length === 0) {
    return [];
  }

  const ids = profiles.map((p) => p.id);
  const { data: edges, error: edgesError } = await supabase
    .from("follows")
    .select("followee_id")
    .eq("follower_id", viewerId)
    .in("followee_id", ids);

  if (edgesError) {
    throw new DataAccessError("listDiscoverableProfilesExcluding follows", edgesError);
  }
  const following = new Set((edges ?? []).map((e) => e.followee_id));

  return profiles.map((p) => ({
    id: p.id,
    handle: p.handle,
    display_name: p.display_name,
    bio: p.bio,
    isFollowing: following.has(p.id),
  }));
}
