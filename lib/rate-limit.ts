import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Rate-limit primitive — Bead tripplanner-s3a.14, hardened 2026-10-29.
 *
 * `withRateLimit` wraps a Server Action body in an atomic per-(profile,
 * surface, window) counter check backed by `public.consume_rate_limit`
 * (supabase/migrations/20261029120000_rls_hardening.sql). The SQL function
 * charges `auth.uid()` — the caller can only ever spend their own budget —
 * and reads the limit and window from `private.rate_limit_rules`, so the
 * thresholds live in the database and a direct API caller cannot choose
 * its own. This module only names the surface.
 *
 * Trust boundary: uses the per-request server client carrying the user's
 * session cookie. No secret key — the function is granted to
 * `authenticated` only.
 */

/**
 * Surface names. Each must have a row in `private.rate_limit_rules`.
 *
 * `HANDLE_CREATE` and `TOS_ACCEPT` are charged inside the
 * `complete_onboarding` and `accept_tos` RPCs, and `TRIP_CREATE` and
 * `TRIP_WRITE` inside the trip RPCs (tripplanner-718). `IMAGES_UPLOAD` is
 * charged by `uploadPendingImage`. The rest are reserved — call sites land
 * in tripplanner-s3a.25.
 *
 * `TRIP_INVITE` and `TRIP_JOIN` are charged inside the invite RPCs
 * (tripplanner-2o5.1).
 */
export const RATE_LIMITS = {
  HANDLE_CREATE: { surface: "handle_create" },
  PROFILE_UPDATE: { surface: "profile_update" },
  FOLLOW: { surface: "follow" },
  BLOCK: { surface: "block" },
  POST: { surface: "post" },
  COMMENT: { surface: "comment" },
  DM: { surface: "dm" },
  JOIN_REQUEST: { surface: "join_request" },
  IMAGES_UPLOAD: { surface: "images_upload" },
  TOS_ACCEPT: { surface: "tos_accept" },
  TRIP_CREATE: { surface: "trip_create" },
  TRIP_WRITE: { surface: "trip_write" },
  // Charged inside create_expense, update_expense and delete_expense
  // (tripplanner-2o5.2).
  EXPENSE_WRITE: { surface: "expense_write" },
  TRIP_INVITE: { surface: "trip_invite" },
  TRIP_JOIN: { surface: "trip_join" },
} as const;

export type RateLimitSpec = {
  surface: string;
};

export type RateLimitResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: "rate_limited"; retryAfterSeconds: number }
  | { ok: false; error: "unauthorized" | "unknown" };

/**
 * Run `work` only if the caller is under their per-surface rate limit.
 *
 *   - Unauthenticated callers get `{ ok: false, error: "unauthorized" }`
 *     without consuming a slot.
 *   - `consume_rate_limit` returns 0 when allowed, otherwise the seconds
 *     until the window resets → `{ ok: false, error: "rate_limited" }`.
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

  const { data: retryAfterSeconds, error } = await supabase.rpc(
    "consume_rate_limit",
    { p_surface: spec.surface },
  );

  if (error) {
    console.error(
      "withRateLimit rpc failed",
      spec.surface,
      error.message,
    );
    return { ok: false, error: "unknown" };
  }

  if (retryAfterSeconds !== 0) {
    return {
      ok: false,
      error: "rate_limited",
      retryAfterSeconds: retryAfterSeconds ?? 60,
    };
  }

  return { ok: true, value: await work() };
}
