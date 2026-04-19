import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Server-only follow-graph helpers (Bead tripplanner-s3a.2).
 *
 * Pure data layer. Server Action wrappers live in
 * `app/_actions/follows-actions.ts` so that mutating helpers can be reused
 * server-side (e.g. from a future RPC handler) without dragging the
 * `revalidatePath` side-effect everywhere.
 *
 * Why server-only: the helpers issue authenticated Supabase calls under the
 * caller's session cookie, which means RLS still applies. Pulling these into
 * the browser would either require shipping the secret key (forbidden) or
 * re-implementing RLS in the client (worse). See `.cursor/rules/supabase-
 * security.mdc`.
 */

export type FollowResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "already_following"
        | "cannot_self_follow"
        | "profile_not_found"
        | "unauthorized"
        | "unknown";
    };

export type UnfollowResult =
  | { ok: true }
  | { ok: false; error: "unauthorized" | "unknown" };

/**
 * Follow another profile. Idempotency boundary: a duplicate insert returns
 * `already_following` (Postgres `23505`) rather than masking it as success;
 * the wrapping action / UI is free to treat that as success if useful.
 *
 * The block check ("Cannot follow if either side has blocked the other") is
 * intentionally NOT enforced here yet — see TODO(s3a.16) in the migration.
 * When `tripplanner-s3a.16` ships, the migration's `follows_insert_self`
 * policy gets the block branch and the failing insert will surface here as
 * the same enum (likely `unknown` until we model it explicitly).
 */
export async function followProfile(followeeId: string): Promise<FollowResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "unauthorized" };
  }

  if (user.id === followeeId) {
    return { ok: false, error: "cannot_self_follow" };
  }

  const { error } = await supabase.from("follows").insert({
    follower_id: user.id,
    followee_id: followeeId,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "already_following" };
    }
    if (error.code === "23514") {
      return { ok: false, error: "cannot_self_follow" };
    }
    if (error.code === "23503") {
      return { ok: false, error: "profile_not_found" };
    }
    console.error("followProfile failed", error.code, error.message);
    return { ok: false, error: "unknown" };
  }

  return { ok: true };
}

/**
 * Unfollow another profile. Idempotent: deleting a non-existent edge is
 * treated as success because "not following" is the desired end state.
 */
export async function unfollowProfile(
  followeeId: string,
): Promise<UnfollowResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "unauthorized" };
  }

  const { error } = await supabase
    .from("follows")
    .delete()
    .match({ follower_id: user.id, followee_id: followeeId });

  if (error) {
    console.error("unfollowProfile failed", error.code, error.message);
    return { ok: false, error: "unknown" };
  }
  return { ok: true };
}

/**
 * Does `followerId` currently follow `followeeId`? Single-row existence check
 * via `head: true` so no payload comes back.
 */
export async function isFollowing(
  followerId: string,
  followeeId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", followerId)
    .eq("followee_id", followeeId);
  if (error) {
    console.error("isFollowing failed", error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

/**
 * Follower / following counts for a profile. RLS-respecting, so any future
 * privacy preference that hides edges will reduce these counts naturally.
 */
export async function getFollowCounts(
  profileId: string,
): Promise<{ followers: number; following: number }> {
  const supabase = await createClient();

  const [followersRes, followingRes] = await Promise.all([
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("followee_id", profileId),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", profileId),
  ]);

  if (followersRes.error) {
    console.error(
      "getFollowCounts followers query failed",
      followersRes.error.message,
    );
  }
  if (followingRes.error) {
    console.error(
      "getFollowCounts following query failed",
      followingRes.error.message,
    );
  }

  return {
    followers: followersRes.count ?? 0,
    following: followingRes.count ?? 0,
  };
}
