import "server-only";

import { CURRENT_TOS_VERSION, type TosVersion } from "@/lib/legal";
import { createClient as createServerClient } from "@/lib/supabase/server";

/**
 * Server-only ToS data-layer helpers (Bead tripplanner-s3a.24).
 *
 * Pure data layer — no `revalidatePath`, no UI side-effects. First
 * acceptance happens inside the `complete_onboarding` RPC together with the
 * profile insert (`lib/profiles.ts#completeOnboarding`). `acceptCurrentTos`
 * here is for the re-acceptance interstitial after a version bump (the
 * deferred `tripplanner-s3a.27` flow). Clients cannot insert into
 * `tos_acceptances` directly; both paths go through RPCs.
 *
 * Why server-only: the helpers issue authenticated Supabase calls under
 * the caller's session cookie, which means RLS still applies. Pulling
 * these into the browser would either require shipping the secret key
 * (forbidden) or re-implementing RLS in the client (worse). See
 * `.cursor/rules/supabase-security.mdc`.
 *
 * Constants/types vs helpers split: `CURRENT_TOS_VERSION` and `TosVersion`
 * live in `lib/legal.ts` because they have a different change rate (a
 * one-line bump per ToS revision) and a different review surface (legal
 * copy review) than this file's Supabase-touching code. Same shape as the
 * `lib/profiles.ts` / `lib/rate-limit.ts` split already in the repo.
 *
 * IP / UA masking lives here — not in the SQL CHECK constraints — so the
 * masking is testable, reviewable in PRs, and applied consistently before
 * any column ever sees the raw value. The DB only stores the masked /
 * truncated form. See migration header for the threat-model framing.
 */

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

/**
 * Result of recording an acceptance for the current ToS version.
 *
 * `alreadyAccepted: true` is the idempotent no-op case: a row for
 * (profile_id, CURRENT_TOS_VERSION) already exists and was not touched by
 * this call. The caller can treat both `alreadyAccepted` values as
 * success.
 */
export type AcceptResult =
  | { ok: true; alreadyAccepted: boolean }
  | { ok: false; error: "rate_limited" | "unauthorized" | "unknown" };

// ----------------------------------------------------------------------------
// IP / UA masking
//
// Implemented as exported pure functions so call-site tests can pin them
// without touching the DB.
// ----------------------------------------------------------------------------

/**
 * Mask an IPv4 dotted-quad to its /24 prefix: keep the first three octets,
 * set the fourth to 0. Returns null if the input is not a parseable IPv4
 * address.
 *
 *   maskIpv4("192.168.1.42") === "192.168.1.0"
 *   maskIpv4("not an ip")    === null
 */
export function maskIpv4(input: string): string | null {
  const parts = input.split(".");
  if (parts.length !== 4) return null;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
  }
  return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
}

/**
 * Mask an IPv6 address to its /48 prefix: keep the first three hextets,
 * drop the rest, append `::`. Returns null if the input is not a
 * confidently-parseable IPv6 address (we err on the side of storing null
 * rather than risk leaking more than intended).
 *
 *   maskIpv6("2001:db8:abcd:1234::1") === "2001:db8:abcd::"
 *   maskIpv6("::1")                   === "0:0:0::"
 *   maskIpv6("not an ip")             === null
 *
 * Implementation note: `::` shorthand needs careful expansion to a fixed
 * 8-hextet form before slicing. Naive split-on-`:` would mis-count
 * positions and the masked output would no longer represent the input's
 * actual /48 prefix. IPv4-mapped IPv6 (e.g. `::ffff:1.2.3.4`) is treated
 * as un-parseable and returns null — the helper does not try to be
 * clever about mixed forms.
 */
export function maskIpv6(input: string): string | null {
  if (input.includes(".")) return null;

  const doubleColonCount = (input.match(/::/g) ?? []).length;
  if (doubleColonCount > 1) return null;

  let parts: string[];
  if (doubleColonCount === 1) {
    const [head = "", tail = ""] = input.split("::");
    const headParts = head === "" ? [] : head.split(":");
    const tailParts = tail === "" ? [] : tail.split(":");
    const missing = 8 - headParts.length - tailParts.length;
    if (missing < 0) return null;
    parts = [
      ...headParts,
      ...Array<string>(missing).fill("0"),
      ...tailParts,
    ];
  } else {
    parts = input.split(":");
  }

  if (parts.length !== 8) return null;
  for (const part of parts) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return null;
  }

  const prefix = parts.slice(0, 3).map((p) => p.toLowerCase()).join(":");
  return `${prefix}::`;
}

/**
 * Mask any client IP to its privacy-preserving prefix. Detects IPv4 vs
 * IPv6 by the presence of a colon. Returns null for missing/empty input
 * or anything we can't confidently parse.
 *
 * The caller (the Server Action) is responsible for plucking the first
 * IP out of `x-forwarded-for` before passing it in; this helper does not
 * try to interpret comma-separated header values.
 */
export function maskIp(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.includes(":")) {
    return maskIpv6(trimmed);
  }
  return maskIpv4(trimmed);
}

/**
 * Truncate a user-agent string to <= 256 chars. Returns null for missing
 * or empty input. The DB CHECK constraint enforces the same length cap as
 * a belt-and-braces.
 */
export function truncateUserAgent(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  const trimmed = input.slice(0, 256);
  return trimmed.length > 0 ? trimmed : null;
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/**
 * Re-export of the constant for call sites that prefer a function shape
 * (e.g. parameterized helpers that take a "version provider").
 */
export function getCurrentTosVersion(): TosVersion {
  return CURRENT_TOS_VERSION;
}

/**
 * True when `profileId` has an acceptance row for the current ToS version.
 * RLS-respecting: the calling session must be `profileId` (or a moderator)
 * for the row to be visible; from any other session this returns false
 * even if a row exists, which is the conservative answer for a gate
 * helper.
 *
 * Used by the deferred `tripplanner-s3a.27` re-acceptance interstitial as
 * the route-guard predicate. Not consumed by this chunk's gate (the
 * Server Action records a fresh acceptance after `createProfile` succeeds
 * rather than checking for one), but shipped here so s3a.27 reuses the
 * same data-layer path.
 */
export async function hasAcceptedCurrentTos(
  profileId: string,
): Promise<boolean> {
  const supabase = await createServerClient();
  const { count, error } = await supabase
    .from("tos_acceptances")
    .select("*", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("version", CURRENT_TOS_VERSION);
  if (error) {
    console.error("hasAcceptedCurrentTos failed", error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

/**
 * Record (or no-op) an acceptance row for the signed-in user against
 * `CURRENT_TOS_VERSION`, via the `accept_tos` RPC. Idempotent on
 * `(profile_id, version)`; a repeat call returns `alreadyAccepted: true`.
 * The RPC charges the `tos_accept` rate limit and stamps `accepted_at`
 * itself, so a direct API caller cannot backdate an acceptance.
 *
 * `opts.ip` and `opts.userAgent` are masked / truncated INSIDE this
 * helper (see `maskIp` and `truncateUserAgent` above). The caller passes
 * the raw values from the request headers; the raw form never reaches the
 * DB.
 */
export async function acceptCurrentTos(opts?: {
  ip?: string | null;
  userAgent?: string | null;
}): Promise<AcceptResult> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("accept_tos", {
    p_version: CURRENT_TOS_VERSION,
    p_ip: maskIp(opts?.ip) ?? undefined,
    p_user_agent: truncateUserAgent(opts?.userAgent) ?? undefined,
  });

  if (error) {
    console.error("acceptCurrentTos failed", error.code, error.message);
    return { ok: false, error: "unknown" };
  }

  switch (data) {
    case "ok":
      return { ok: true, alreadyAccepted: false };
    case "already_accepted":
      return { ok: true, alreadyAccepted: true };
    case "rate_limited":
    case "unauthorized":
      return { ok: false, error: data };
    default:
      console.error("acceptCurrentTos returned an unexpected status", data);
      return { ok: false, error: "unknown" };
  }
}
