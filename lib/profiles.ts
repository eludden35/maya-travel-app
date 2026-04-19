import "server-only";

import { redirect } from "next/navigation";

import type { Database } from "@/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-only Profile helpers.
 *
 * The Profile entity (Bead tripplanner-s3a.1) is the public identity row keyed
 * 1:1 to `auth.users`. New users sign in, then get gated to `/onboarding/handle`
 * by `requireProfile()` until they pick a handle and a display name.
 *
 * Why server-only: writing to `profiles` from the browser would require sending
 * the writable column set across the wire, which makes the whitelist easier to
 * forget. Keeping `createProfile` / `updateProfile` as Server Actions means the
 * column whitelist lives in one place and runs against the user's session
 * cookie, so RLS still applies (we are NOT using the secret key here).
 */

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export type DiscoverableProfile = Pick<
  ProfileRow,
  "id" | "handle" | "display_name" | "bio"
> & { isFollowing: boolean };

export type CreateProfileResult =
  | { ok: true }
  | { ok: false; error: "invalid_handle" | "invalid_display_name" | "handle_taken" | "unauthorized" | "unknown" };

export type UpdateProfileResult =
  | { ok: true }
  | { ok: false; error: "invalid_display_name" | "invalid_bio" | "unauthorized" | "unknown" };

const HANDLE_REGEX = /^[a-z0-9_]{3,30}$/;
const DISPLAY_NAME_MIN = 1;
const DISPLAY_NAME_MAX = 50;
const BIO_MAX = 500;

/**
 * Fetch the Profile row for the currently authenticated user. Returns `null`
 * if the user is not signed in or has not completed onboarding.
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
    // Best-effort log; never leak the user id into the message.
    console.error("getCurrentProfile failed", error.message);
    return null;
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
 * Server Action: create the current user's Profile row.
 *
 * Whitelisted columns: handle, display_name. Everything else (id, is_moderator,
 * is_discoverable, created_at, updated_at) is left to defaults or auth.uid().
 * The DB trigger `profiles_no_privilege_escalation` is the second line of
 * defense.
 */
export async function createProfile(input: {
  handle: string;
  displayName: string;
}): Promise<CreateProfileResult> {
  const handle = input.handle.trim().toLowerCase();
  const displayName = input.displayName.trim();

  if (!HANDLE_REGEX.test(handle)) {
    return { ok: false, error: "invalid_handle" };
  }
  if (
    displayName.length < DISPLAY_NAME_MIN ||
    displayName.length > DISPLAY_NAME_MAX
  ) {
    return { ok: false, error: "invalid_display_name" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "unauthorized" };
  }

  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    handle,
    display_name: displayName,
  });

  if (error) {
    // 23505 = unique_violation (handle collision).
    if (error.code === "23505") {
      return { ok: false, error: "handle_taken" };
    }
    // 23514 = check_violation; the regex check is the only check on insert
    // for whitelisted columns, but length on display_name could also fire.
    if (error.code === "23514") {
      return { ok: false, error: "invalid_handle" };
    }
    console.error("createProfile failed", error.code, error.message);
    return { ok: false, error: "unknown" };
  }

  return { ok: true };
}

/**
 * Server Action: update the current user's Profile row.
 *
 * Whitelisted columns: display_name, bio, is_discoverable. handle is not
 * editable here at MVP (handle changes are a reclaim/squat hazard — own Bead).
 * is_moderator is not editable here ever (DB trigger blocks it anyway).
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
 */
export async function listDiscoverableProfilesExcluding(
  viewerId: string,
  limit: number,
): Promise<DiscoverableProfile[]> {
  const supabase = await createClient();

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, handle, display_name, bio")
    .eq("is_discoverable", true)
    .neq("id", viewerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (profilesError) {
    console.error(
      "listDiscoverableProfilesExcluding profiles query failed",
      profilesError.message,
    );
    return [];
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
    console.error(
      "listDiscoverableProfilesExcluding follows query failed",
      edgesError.message,
    );
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
