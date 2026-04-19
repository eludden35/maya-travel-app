---
name: rate limiting primitive + handle-creation wiring (s3a.14)
overview: "Ship the rate-limit primitive (counters table + atomic SQL function) and wire it to ONE existing action (handle creation in `app/onboarding/handle/actions.ts`) so the primitive is exercised end-to-end. Wiring to Posts / Comments / Follows / DMs / join requests is filed as a follow-up — those actions either don't exist yet (Posts, Comments, DMs) or would conflict with another parallel chunk this session (Follows)."
todos:
  - id: migration
    content: "Write supabase/migrations/20260419050100_rate_limits.sql: rate_limit_counters table (composite PK on (profile_id, surface, window_start)) + try_consume_rate_limit(p_surface text, p_max int, p_window_seconds int) returns boolean (security definer, atomic upsert + count check) + RLS denying all client access (server-only via the function) + threshold defaults documented in a comment block."
    status: pending
  - id: helper
    content: "lib/rate-limit.ts (server-only): withRateLimit({ surface, max, windowSeconds }, work) higher-order helper. Calls the SQL function via a service-role client; returns { ok: true, value } or { ok: false, error: 'rate_limited', retryAfterSeconds }. Maps SQL function false to rate_limited; SQL errors to 'unknown'. Exports a thresholds constant block with the documented defaults so call sites import a name not a magic number."
    status: pending
  - id: wire-handle
    content: "app/onboarding/handle/actions.ts: wrap the existing handle-create action in withRateLimit({ surface: 'handle_create', max: HANDLE_CREATE.max, windowSeconds: HANDLE_CREATE.window }). On rate_limited result, return a structured form-submit error so the existing client surface can show 'Try again in N seconds'. DO NOT modify lib/profiles.ts and DO NOT modify the handle-form client component (keep changes to actions.ts only; surface the rate-limit error through the existing return-shape if possible, or extend the return-shape minimally)."
    status: pending
  - id: smoke
    content: "Smoke test: psql via Supabase project ref or supabase db remote-execute (whichever the repo uses) — call try_consume_rate_limit('test_surface', 2, 60) three times for a fixed UUID; first two return true, third returns false. Then call try_consume_rate_limit('test_surface', 2, 0) (zero window) returns true (window resets). Document the smoke-test commands + outputs in the report back."
    status: pending
  - id: verify
    content: "pnpm tsc --noEmit; pnpm lint; ReadLints; rg 'SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|sb_secret_' lib/ app/ proxy.ts — only allowed in lib/rate-limit.ts (server-only) and the existing supabase/server.ts setup. Money-privacy rg negative: rate_limit_counters never references trips/expenses. Report draft commit message + list of changed files."
    status: pending
isProject: false
---

# s3a.14 — rate limiting primitive

**Active Bead:** [`tripplanner-s3a.14`](#) — _infra: rate limiting (Posts, Comments, Follows, DMs, join requests)_, P1, parent `tripplanner-s3a`. No declared blockers.

**Bead AC (verbatim):** _Rate-limit primitive shipped (counters + function). Wired into Posts, Comments, Follows, DMs, join requests. Sane default thresholds (numbers tuned in implementation, documented in migration comment). 429 responses with Retry-After when denied._

## Decisions made up-front

- **Primitive + ONE wired call site this chunk.** The AC says "Wired into Posts, Comments, Follows, DMs, join requests" — three of those five actions don't exist yet (Posts `s3a.9`, Comments `s3a.11`, DMs `s3a.13`). Wiring to Follows would conflict with `s3a.16` running in parallel this session. Honest split: ship the primitive end-to-end against handle creation (the only existing writeable surface besides Follows), file a follow-up Bead for the rest.
- **Rationale for handle creation as the wired surface.** Handle creation is currently unrate-limited; a bot could squat handles by spamming the action. Real value-add. Also lets us prove the helper works against an existing Server Action shape today.
- **No `429 + Retry-After` HTTP layer at MVP.** The AC mentions HTTP 429 + Retry-After. Server Actions don't return HTTP responses directly — they return values to the client. Map `rate_limited` to a structured form result that the client can render. When Route Handlers ship for any of Posts / Comments / DMs, those will return real 429s via the same primitive. Document this in the migration header.
- **Counters table over Redis / KV.** Postgres-only because (a) we already have it, (b) Supabase doesn't ship a managed KV at MVP, (c) the SQL function makes the increment atomic without an extra round-trip. Trade-off: under heavy load this becomes a hot row; if/when we have user volume, swap to Upstash Redis behind the same `withRateLimit` helper interface — the primitive's signature is stable.
- **Sliding window via fixed buckets.** `window_start` is the bucket boundary (e.g. `date_trunc('minute', now())` for a 60s window — but generalised to any window length). Cheap, slightly bursty at the boundary, fine at MVP scale. Document the trade-off in the function comment.
- **Counters are server-only data.** RLS rejects all client access. The function is `security definer` so it can write regardless of the caller's RLS, but the function itself is only callable by service-role / authenticated callers via the helper.
- **Single commit.** One coherent slice.

## Schema

`supabase/migrations/20260419050100_rate_limits.sql`:

```sql
-- Header: scope = rate-limit primitive (s3a.14)
-- Threat model:
--   1) Read: nobody at MVP. RLS rejects all selects from the client.
--   2) Write: the security-definer function only; the helper in lib/rate-limit.ts
--      is the only Node call site and runs server-side via the service-role key.
--   3) Outside: a malicious caller cannot bypass since the function is the only
--      write path and it always counts.
--   4) PII: profile_id (FK to auth.users essentially) + a surface label + a count.
--      No trip data, no money data, no message contents — see ADR 0002.
--   5) Open consumers (deferred to follow-up):
--      Posts (s3a.9), Comments (s3a.11), Follows (s3a.2 actions),
--      DMs (s3a.13), join requests (s3a.12 / s3a.15).
-- Defaults documented (Active = max writes per window; tune later):
--   handle_create   = 5 per hour      (anti-handle-squatting)
--   profile_update  = 30 per hour     (typical) [reserved, not wired this chunk]
--   follow          = 100 per hour    [reserved, not wired this chunk]
--   block           = 50 per hour     [reserved, not wired this chunk]
--   post            = 30 per hour     [reserved, not wired this chunk]
--   comment         = 60 per hour     [reserved, not wired this chunk]
--   dm              = 100 per hour    [reserved, not wired this chunk]
--   join_request    = 20 per day      [reserved, not wired this chunk]
-- Sliding-window note: bucket boundaries align to window length, so the
-- effective window can be up to 2x the configured length at the boundary.
-- Acceptable at MVP; revisit when load matters.

create table public.rate_limit_counters (
  profile_id    uuid not null references auth.users(id) on delete cascade,
  surface       text not null,
  window_start  timestamptz not null,
  count         int not null default 0,
  primary key (profile_id, surface, window_start)
);

-- Cheap garbage collection candidate: an index on window_start to allow a
-- daily prune via a future cron / SQL call.
create index rate_limit_counters_window_idx on public.rate_limit_counters (window_start);

alter table public.rate_limit_counters enable row level security;
-- No policies = no client access. Only the security-definer function reads/writes.

create or replace function public.try_consume_rate_limit(
  p_profile_id uuid,
  p_surface text,
  p_max int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_new_count int;
begin
  -- Bucket the current time to the window boundary.
  -- For p_window_seconds = 0, treat as "no window" (immediate reset every call) — useful in tests.
  if p_window_seconds <= 0 then
    v_window_start := now();
  else
    v_window_start := to_timestamp(
      floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
    );
  end if;

  insert into public.rate_limit_counters (profile_id, surface, window_start, count)
  values (p_profile_id, p_surface, v_window_start, 1)
  on conflict (profile_id, surface, window_start)
    do update set count = public.rate_limit_counters.count + 1
    returning count into v_new_count;

  return v_new_count <= p_max;
end;
$$;

revoke all on function public.try_consume_rate_limit(uuid, text, int, int) from public;
grant execute on function public.try_consume_rate_limit(uuid, text, int, int) to service_role, authenticated;
```

Notes:
- The function is callable by `authenticated` (so Server Actions running with the user's session can call it directly without going through the service-role client). This is fine because the function only ever increments — there's no read-bypass concern.
- BUT the helper still uses the service-role client by default for predictability, since rate-limiting should never be skippable by an RLS edge case. Document this design choice in `lib/rate-limit.ts`.
- The helper passes `auth.uid()` explicitly (resolved server-side from the session) so the function isn't relying on `auth.uid()` inside itself — explicit profile_id avoids a hidden coupling.

## App layer

- **`lib/rate-limit.ts`** (new, server-only): wrap `import "server-only";` at the top.
  ```ts
  export const RATE_LIMITS = {
    HANDLE_CREATE: { surface: "handle_create", max: 5, windowSeconds: 3600 },
    // others reserved — see migration comment
  } as const;

  export type RateLimitResult<T> =
    | { ok: true; value: T }
    | { ok: false; error: "rate_limited"; retryAfterSeconds: number }
    | { ok: false; error: "unauthorized" | "unknown" };

  export async function withRateLimit<T>(
    spec: { surface: string; max: number; windowSeconds: number },
    work: () => Promise<T>,
  ): Promise<RateLimitResult<T>> {
    // 1. Resolve the caller's profile_id from the server-side session.
    //    If unauth, return { ok: false, error: 'unauthorized' }.
    // 2. Call the SQL function. If it returns false -> { ok: false, error: 'rate_limited',
    //    retryAfterSeconds: spec.windowSeconds }.
    // 3. Otherwise await work() and return its value.
  }
  ```
  - Use `createClient` from `@/lib/supabase/server` (the per-request server client) for the function call — it carries the user's session and the function is `grant execute … to authenticated`. Using the user's session means rate-limiting is per-user, not per-request-id. The service-role client is overkill here.
  - For `retryAfterSeconds`, return the configured `windowSeconds`. (More precise: compute time-until-next-bucket. Acceptable to use the window length at MVP; document.)

- **`app/onboarding/handle/actions.ts`** (modify):
  - Read the existing action and identify its return shape (it's a form Server Action, likely returning `{ ok: true } | { ok: false; error: ... }`).
  - Wrap the body in `withRateLimit(RATE_LIMITS.HANDLE_CREATE, async () => { /* existing body */ })`.
  - On `rate_limited`, return a return-shape variant the existing client form can surface. If the existing return type is `{ ok: false; error: string }`, add `"rate_limited"` to the union. The client either currently displays the `error` string or the subagent should keep the existing display shape and translate `rate_limited` → a user-friendly string like `Slow down — try again in a minute.` inside `actions.ts`.
  - **Do NOT modify `app/onboarding/handle/handle-form.tsx`** unless the existing form's error-display logic genuinely cannot show the new error string with no client changes. If a tiny client tweak is unavoidable, document it in the report-back.

## Deferred / out of scope

- Wiring to Follows actions (`app/_actions/follows-actions.ts`) — conflict with `s3a.16` parallel chunk; file as follow-up.
- Wiring to Posts / Comments / DMs / join requests — those actions don't exist yet.
- Real HTTP `429 + Retry-After` headers — only relevant for Route Handlers, which haven't shipped yet.
- A `pg_cron` job to prune old `rate_limit_counters` rows — defer until rows accumulate enough to matter.

## Bead bookkeeping (parent agent)

- **Create `tripplanner-s3a.25`** — _feat: wire withRateLimit to the rest of the writeable surfaces (Follows, Posts, Comments, DMs, join requests, Block)_, P2, parent `s3a`, deps `blocked-by:tripplanner-s3a.14` + soft deps on each consumer Bead. Acceptance: each writeable Server Action / Route Handler calls `withRateLimit` with the appropriate threshold from the `RATE_LIMITS` constant; threshold tuning notes added to the migration's comment block as we learn from real usage.
- **Append note to `tripplanner-s3a.14` then close.** Summary: primitive shipped + handle_create wired; rest deferred to s3a.25.

## Verification

- `pnpm tsc --noEmit` clean.
- `pnpm lint` clean.
- `ReadLints` clean on every touched file.
- Boundary `rg "SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|sb_secret_" lib/ app/ proxy.ts` — only doc-comment matches.
- `rg "TODO\(s3a\.14\)" supabase/migrations/` — zero matches.
- Smoke test (parent agent will run after pushing the migration):
  - Pick a real test profile id (or create one).
  - `select public.try_consume_rate_limit('<uuid>', 'smoke_test', 2, 60);` three times — expect `t, t, f`.
  - `select count(*) from public.rate_limit_counters where surface = 'smoke_test';` — expect 1 row.
  - `delete from public.rate_limit_counters where surface = 'smoke_test';` — clean up.

## Subagent instructions

- Implement everything above. Do NOT push the migration. Do NOT regenerate types. Do NOT git commit. Do NOT do bead bookkeeping (parent agent handles all of those at the end).
- Do NOT touch `lib/follows.ts`, `app/_actions/follows-actions.ts`, `app/_components/follow-button.tsx`, `app/page.tsx`, `app/layout.tsx`, `lib/profiles.ts`, or any of the `app/legal/**` paths — those belong to other parallel chunks this session.
- Report back: (1) list of changed files, (2) draft commit message body using the s3a.2 commit style, (3) the exact return-shape change you made to the handle-create Server Action and whether the existing handle-form client component needed any tweak.
