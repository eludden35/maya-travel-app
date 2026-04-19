import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Server-only blocks + mutes helpers (Bead tripplanner-s3a.16).
 *
 * Pure data layer. Server Action wrappers live in
 * `app/_actions/blocks-actions.ts` so that mutating helpers can be reused
 * server-side without dragging the `revalidatePath` side-effect everywhere.
 *
 * Why server-only: the helpers issue authenticated Supabase calls under the
 * caller's session cookie, which means RLS still applies. Pulling these into
 * the browser would either require shipping the secret key (forbidden) or
 * re-implementing RLS in the client (worse). See `.cursor/rules/supabase-
 * security.mdc`.
 */

export type BlockResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "already_blocking"
        | "cannot_self_block"
        | "profile_not_found"
        | "unauthorized"
        | "unknown";
    };

export type UnblockResult =
  | { ok: true }
  | { ok: false; error: "unauthorized" | "unknown" };

export type MuteResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "already_muting"
        | "cannot_self_mute"
        | "profile_not_found"
        | "unauthorized"
        | "unknown";
    };

export type UnmuteResult =
  | { ok: true }
  | { ok: false; error: "unauthorized" | "unknown" };

/**
 * Block another profile. The DB-side `AFTER INSERT` trigger atomically
 * deletes any follow edge in either direction, so a successful insert
 * here is the symmetric-invisibility commit point.
 *
 * Idempotency boundary: a duplicate insert returns `already_blocking`
 * (Postgres `23505`) rather than masking it as success; the wrapping
 * action / UI is free to treat that as success if useful.
 */
export async function blockProfile(blockedId: string): Promise<BlockResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "unauthorized" };
  }

  if (user.id === blockedId) {
    return { ok: false, error: "cannot_self_block" };
  }

  const { error } = await supabase.from("blocks").insert({
    blocker_id: user.id,
    blocked_id: blockedId,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "already_blocking" };
    }
    if (error.code === "23514") {
      return { ok: false, error: "cannot_self_block" };
    }
    if (error.code === "23503") {
      return { ok: false, error: "profile_not_found" };
    }
    console.error("blockProfile failed", error.code, error.message);
    return { ok: false, error: "unknown" };
  }

  return { ok: true };
}

/**
 * Unblock another profile. Idempotent: deleting a non-existent edge is
 * treated as success because "not blocking" is the desired end state.
 */
export async function unblockProfile(
  blockedId: string,
): Promise<UnblockResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "unauthorized" };
  }

  const { error } = await supabase
    .from("blocks")
    .delete()
    .match({ blocker_id: user.id, blocked_id: blockedId });

  if (error) {
    console.error("unblockProfile failed", error.code, error.message);
    return { ok: false, error: "unknown" };
  }
  return { ok: true };
}

/**
 * Mute another profile. Mute is intentionally invisible to the muted
 * party (no notification, no inferable side-effect). Mirrors
 * `blockProfile` shape so callers can treat the two operations
 * symmetrically.
 */
export async function muteProfile(mutedId: string): Promise<MuteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "unauthorized" };
  }

  if (user.id === mutedId) {
    return { ok: false, error: "cannot_self_mute" };
  }

  const { error } = await supabase.from("mutes").insert({
    muter_id: user.id,
    muted_id: mutedId,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "already_muting" };
    }
    if (error.code === "23514") {
      return { ok: false, error: "cannot_self_mute" };
    }
    if (error.code === "23503") {
      return { ok: false, error: "profile_not_found" };
    }
    console.error("muteProfile failed", error.code, error.message);
    return { ok: false, error: "unknown" };
  }

  return { ok: true };
}

/**
 * Unmute another profile. Idempotent.
 */
export async function unmuteProfile(
  mutedId: string,
): Promise<UnmuteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "unauthorized" };
  }

  const { error } = await supabase
    .from("mutes")
    .delete()
    .match({ muter_id: user.id, muted_id: mutedId });

  if (error) {
    console.error("unmuteProfile failed", error.code, error.message);
    return { ok: false, error: "unknown" };
  }
  return { ok: true };
}

/**
 * Bidirectional existence check: is `viewerId` blocking `otherId`, OR is
 * `otherId` blocking `viewerId`? Used by callers (e.g. future DM /
 * profile-page consumers) that want to gate a UI affordance behind the
 * same predicate the `follows_insert_self` policy uses.
 *
 * RLS-respecting: only rows where `auth.uid() = blocker_id` are visible
 * to the caller, so this only reliably detects blocks the caller knows
 * about (their own outbound, or — by recursion through `viewerId` being
 * the session user — incoming blocks if invoked under that session).
 * Practically this is invoked with `viewerId = auth.uid()`, which is
 * what makes the bidirectional check honest.
 */
export async function isBlockingOrBlocked(
  viewerId: string,
  otherId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("blocks")
    .select("*", { count: "exact", head: true })
    .or(
      `and(blocker_id.eq.${viewerId},blocked_id.eq.${otherId}),and(blocker_id.eq.${otherId},blocked_id.eq.${viewerId})`,
    );

  if (error) {
    console.error("isBlockingOrBlocked failed", error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

/**
 * Returns every profile id that `viewerId` is currently blocking. Used by
 * the home-page discover query to filter out blocked profiles before
 * rendering. RLS makes this only return rows where the caller is the
 * blocker, which is exactly what we want.
 */
export async function getBlockedProfileIds(
  viewerId: string,
): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blocks")
    .select("blocked_id")
    .eq("blocker_id", viewerId);

  if (error) {
    console.error("getBlockedProfileIds failed", error.message);
    return [];
  }
  return (data ?? []).map((row) => row.blocked_id);
}
