import "server-only";

/**
 * Single source of truth for the currently-published ToS version.
 *
 * This constant is split out from `lib/tos.ts` deliberately: constants and
 * types here have a different change rate (a one-line bump per ToS
 * revision) and a different review surface (legal copy review) than the
 * Supabase-touching helpers in `lib/tos.ts`. Same shape as the
 * `lib/profiles.ts` / `lib/rate-limit.ts` split already in the repo.
 *
 * Bump this string when the wording on /legal/{terms,community-guidelines,
 * privacy} changes materially. The acceptance gate in
 * `app/onboarding/handle/actions.ts` checks against this constant, and
 * `lib/tos.ts#hasAcceptedCurrentTos(profileId)` returns false for any
 * signed-in user whose latest acceptance row predates a bump.
 *
 * In-app re-acceptance UX for existing users when this constant bumps is
 * tracked separately as the deferred follow-up Bead `tripplanner-s3a.27`
 * (`feat: in-app re-acceptance flow on ToS version bump`). Acceptable gap
 * at MVP because the user count is zero — any bump landing before s3a.27
 * affects zero accounts.
 *
 * Format is opaque — human-readable for the audit trail, not parsed by
 * code. Convention: `v<n.m>-<YYYY-MM-DD>` to make ordering eyeballable in
 * the moderator queue.
 *
 * Pinned `import "server-only"` so a future client component cannot
 * accidentally inline the constant into the browser bundle. The string
 * itself is harmless on the client; the discipline keeps the legal
 * namespace consistent.
 */
export const CURRENT_TOS_VERSION = "v1.0-2026-04-19";

/**
 * Type alias for the acceptance row's `version` column. The DB stores
 * arbitrary text (length-checked); using this alias at call sites
 * documents intent without inventing a phantom enum.
 */
export type TosVersion = string;
