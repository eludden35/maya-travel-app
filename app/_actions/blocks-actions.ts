"use server";

import { revalidatePath } from "next/cache";

import {
  blockProfile,
  muteProfile,
  unblockProfile,
  unmuteProfile,
  type BlockResult,
  type MuteResult,
  type UnblockResult,
  type UnmuteResult,
} from "@/lib/blocks";
import { isUuid } from "@/lib/uuid";

/**
 * Server Action wrappers for blocks + mutes (Bead tripplanner-s3a.16).
 *
 * Same shape as `app/_actions/follows-actions.ts`:
 *   1. `"use server"` boundary so client components can import these.
 *   2. Side-effect placement — `revalidatePath('/')` lives here, not in
 *      `lib/blocks.ts`, so the pure data layer stays reusable from other
 *      contexts (RPC handlers, scripts) where revalidation is meaningless.
 *   3. Argument shape — keep the wire shape narrow so the client can't
 *      pass anything other than a string profile id.
 *
 * Both block and mute revalidate `/` because the home-page discover list
 * filters on the caller's blocked-id set; an unfollow side-effect of the
 * `blocks` AFTER INSERT trigger also changes follow-state on the same page.
 * Mute does not change the home page yet (mute UI is deferred until feed /
 * explore land), but revalidation costs effectively nothing and keeps the
 * action wrappers symmetrical.
 */

export async function blockAction(profileId: string): Promise<BlockResult> {
  if (!isUuid(profileId)) {
    return { ok: false, error: "profile_not_found" };
  }
  const result = await blockProfile(profileId);
  if (result.ok) {
    revalidatePath("/");
  }
  return result;
}

export async function unblockAction(
  profileId: string,
): Promise<UnblockResult> {
  if (!isUuid(profileId)) {
    return { ok: true };
  }
  const result = await unblockProfile(profileId);
  if (result.ok) {
    revalidatePath("/");
  }
  return result;
}

export async function muteAction(profileId: string): Promise<MuteResult> {
  if (!isUuid(profileId)) {
    return { ok: false, error: "profile_not_found" };
  }
  const result = await muteProfile(profileId);
  if (result.ok) {
    revalidatePath("/");
  }
  return result;
}

export async function unmuteAction(
  profileId: string,
): Promise<UnmuteResult> {
  if (!isUuid(profileId)) {
    return { ok: true };
  }
  const result = await unmuteProfile(profileId);
  if (result.ok) {
    revalidatePath("/");
  }
  return result;
}
