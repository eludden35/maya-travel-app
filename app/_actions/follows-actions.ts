"use server";

import { revalidatePath } from "next/cache";

import {
  followProfile,
  unfollowProfile,
  type FollowResult,
  type UnfollowResult,
} from "@/lib/follows";
import { isUuid } from "@/lib/uuid";

/**
 * Server Action wrappers for the follow graph (Bead tripplanner-s3a.2).
 *
 * The wrappers exist for three reasons:
 *   1. `"use server"` boundary — the FollowButton client component imports
 *      these directly and Next.js will refuse to import a non-action server
 *      module from a client.
 *   2. Side-effect placement — `revalidatePath('/')` lives here, not in
 *      `lib/follows.ts`, so the pure data layer stays reusable from contexts
 *      (e.g. RPC handlers, scripts) where revalidation is meaningless.
 *   3. Argument shape — keep the wire shape narrow so the client can't pass
 *      anything other than a string profile id.
 */

export async function followAction(profileId: string): Promise<FollowResult> {
  if (!isUuid(profileId)) {
    return { ok: false, error: "profile_not_found" };
  }
  const result = await followProfile(profileId);
  if (result.ok) {
    revalidatePath("/");
  }
  return result;
}

export async function unfollowAction(
  profileId: string,
): Promise<UnfollowResult> {
  if (!isUuid(profileId)) {
    return { ok: true };
  }
  const result = await unfollowProfile(profileId);
  if (result.ok) {
    revalidatePath("/");
  }
  return result;
}
