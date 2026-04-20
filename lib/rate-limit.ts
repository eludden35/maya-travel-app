import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Rate-limit primitive — Bead tripplanner-s3a.14.
 *
 * `withRateLimit` wraps a Server Action body in an atomic per-(profile,
 * surface, window) counter check backed by `public.try_consume_rate_limit`
 * (see supabase/migrations/20260419050100_rate_limits.sql). The SQL
 * function is the single legitimate write path for `rate_limit_counters`;
 * RLS rejects everything else.
 *
 * Trust boundary:
 *   - The SQL function is `grant execute … to authenticated`, so this
 *     helper uses the per-request server client (`createClient` from
 *     `@/lib/supabase/server`) carrying the user's session cookie. No
 *     `SUPABASE_SECRET_KEY` / service-role usage here — rate limiting is
 *     per-user, not per-request-id, so the user's auth context is exactly
 *     what we want. The function only ever increments; there is no read
 *     bypass to worry about.
 *
 * Sliding-window precision:
 *   - `retryAfterSeconds` returns the configured window length. A more
 *     precise "time to next bucket boundary" calc is fine to add later;
 *     the window length is a safe upper bound at MVP and matches the
 *     bucket-aligned semantics documented in the migration header.
 */

/**
 * Default thresholds. Mirror the comment block in
 * supabase/migrations/20260419050100_rate_limits.sql; if you change a
 * number here, update the migration comment so the source of truth stays
 * coherent.
 *
 * Wired in this chunk: `HANDLE_CREATE` (handle-creation Server Action).
 * Wired by sibling Beads in the current parallel batch:
 *   - `IMAGES_UPLOAD` → tripplanner-s3a.4 (uploadPendingImage helper).
 *   - `TOS_ACCEPT` → tripplanner-s3a.24 (acceptCurrentTos helper).
 * Pre-allocated here as a parent-agent prep step so neither s3a.4 nor
 * s3a.24 needs to modify this file in parallel.
 * The rest are reserved names — call sites land in tripplanner-s3a.25.
 */
export const RATE_LIMITS = {
  HANDLE_CREATE: { surface: "handle_create", max: 5, windowSeconds: 60 * 60 },
  PROFILE_UPDATE: { surface: "profile_update", max: 30, windowSeconds: 60 * 60 },
  FOLLOW: { surface: "follow", max: 100, windowSeconds: 60 * 60 },
  BLOCK: { surface: "block", max: 50, windowSeconds: 60 * 60 },
  POST: { surface: "post", max: 30, windowSeconds: 60 * 60 },
  COMMENT: { surface: "comment", max: 60, windowSeconds: 60 * 60 },
  DM: { surface: "dm", max: 100, windowSeconds: 60 * 60 },
  JOIN_REQUEST: { surface: "join_request", max: 20, windowSeconds: 60 * 60 * 24 },
  IMAGES_UPLOAD: { surface: "images_upload", max: 10, windowSeconds: 60 * 60 },
  TOS_ACCEPT: { surface: "tos_accept", max: 10, windowSeconds: 60 * 60 },
} as const;

export type RateLimitSpec = {
  surface: string;
  max: number;
  windowSeconds: number;
};

export type RateLimitResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: "rate_limited"; retryAfterSeconds: number }
  | { ok: false; error: "unauthorized" | "unknown" };

/**
 * Run `work` only if the caller is under their per-surface rate limit.
 *
 *   - Resolves the caller's `profile_id` from the server-side session.
 *     Unauthenticated callers get `{ ok: false, error: "unauthorized" }`
 *     without consuming a slot.
 *   - Calls `public.try_consume_rate_limit(profile_id, surface, max, window)`.
 *     `false` → `{ ok: false, error: "rate_limited", retryAfterSeconds }`.
 *   - Otherwise awaits `work()` and returns its result wrapped in `ok: true`.
 *   - Any unexpected SQL error → `{ ok: false, error: "unknown" }`. Errors
 *     are logged best-effort; the user-facing message lives at the call site
 *     so we never leak SQL details into the UI.
 */
export async function withRateLimit<T>(
  spec: RateLimitSpec,
  work: () => Promise<T>,
): Promise<RateLimitResult<T>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "unauthorized" };
  }

  const { data: allowed, error } = await supabase.rpc(
    "try_consume_rate_limit",
    {
      p_profile_id: user.id,
      p_surface: spec.surface,
      p_max: spec.max,
      p_window_seconds: spec.windowSeconds,
    },
  );

  if (error) {
    console.error(
      "withRateLimit rpc failed",
      spec.surface,
      error.message,
    );
    return { ok: false, error: "unknown" };
  }

  if (allowed !== true) {
    return {
      ok: false,
      error: "rate_limited",
      retryAfterSeconds: spec.windowSeconds,
    };
  }

  return { ok: true, value: await work() };
}
