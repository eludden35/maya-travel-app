-- =============================================================================
-- rate_limit_counters: per-(profile, surface, window) write counters that back
--                      the withRateLimit() helper in lib/rate-limit.ts.
--                      Bead tripplanner-s3a.14.
--
-- Threat model (per .cursor/skills/project-architecture/SKILL.md):
--
--   1. Who can READ this data?
--      - Nobody from the client. RLS is enabled and there are no policies, so
--        every direct select from an `authenticated` or `anon` role returns
--        zero rows. The counters are server-side bookkeeping.
--
--   2. Who can WRITE this data?
--      - Only public.try_consume_rate_limit() (security definer) below. The
--        function is the single write path; lib/rate-limit.ts is the single
--        Node call site. Direct insert/update/delete from the client is
--        rejected by absence of any RLS policy (RLS is on, no rows allowed).
--
--   3. What if someone outside that set sends the request anyway?
--      - select returns nothing.
--      - insert / update / delete rejected by RLS.
--      - rpc(try_consume_rate_limit, ...) succeeds for any `authenticated`
--        caller — and that is the point. The function only ever increments;
--        there is no read or destructive surface to exploit. The worst a
--        malicious caller can do is exhaust THEIR OWN rate limit faster.
--
--   4. Logs / PII?
--      - profile_id (FK to auth.users via the cascade below), a surface
--        label, a bucket timestamp, an integer count. No trip data, no
--        money data, no message contents. The money-privacy hard rule
--        from ADR 0002 is unaffected: nothing in this migration touches
--        monetary tables.
--
--   5. Open consumers (deferred to follow-up tripplanner-s3a.25):
--        Posts (s3a.9), Comments (s3a.11), Follows (s3a.2 actions),
--        DMs (s3a.13), Block (s3a.16), join requests (s3a.12 / s3a.15).
--      This chunk wires ONLY handle creation
--      (app/onboarding/handle/actions.ts) — the only existing writeable
--      Server Action surface that doesn't conflict with another parallel
--      chunk this session.
--
-- Default thresholds (Active = max writes per window; tune later in this
-- comment block as we learn from real usage). Mirror these in the
-- RATE_LIMITS constant in lib/rate-limit.ts:
--   handle_create   = 5  per hour      (anti-handle-squatting; ACTIVE)
--   profile_update  = 30 per hour      (reserved, not wired this chunk)
--   follow          = 100 per hour     (reserved, not wired this chunk)
--   block           = 50 per hour      (reserved, not wired this chunk)
--   post            = 30 per hour      (reserved, not wired this chunk)
--   comment         = 60 per hour      (reserved, not wired this chunk)
--   dm              = 100 per hour     (reserved, not wired this chunk)
--   join_request    = 20 per day       (reserved, not wired this chunk)
--
-- Sliding-window note: bucket boundaries align to window length, so a caller
-- who hits the cap right before a boundary can spend another full quota right
-- after it — the effective window can be up to 2x the configured length at
-- the boundary. Acceptable at MVP; revisit when load matters.
--
-- HTTP-429 note: the AC mentions "429 responses with Retry-After when
-- denied". Server Actions return values, not HTTP responses, so this chunk
-- maps `rate_limited` to a structured form result that the page renders.
-- Real 429 + Retry-After headers will land alongside the first Route Handler
-- that calls withRateLimit() (none exist at the time of this migration).
--
-- Garbage collection: rate_limit_counters_window_idx supports a future cron
-- prune (e.g. delete rows where window_start < now() - interval '7 days').
-- Not scheduled at MVP — file as discovered-from when row count matters.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Table
-- ----------------------------------------------------------------------------

create table public.rate_limit_counters (
  profile_id    uuid not null references auth.users(id) on delete cascade,
  surface       text not null
                  check (surface ~ '^[a-z0-9_]{1,64}$'),
  window_start  timestamptz not null,
  count         integer not null default 0
                  check (count >= 0),
  primary key (profile_id, surface, window_start)
);

comment on table public.rate_limit_counters is
  'Per-(profile, surface, window) write counters. RLS-locked: server-only via public.try_consume_rate_limit(). See migration header + ADR 0002.';

-- Supports a future GC prune by window_start. The PK already covers
-- (profile_id, surface, window_start) lookups by the function.
create index rate_limit_counters_window_idx
  on public.rate_limit_counters (window_start);

-- ----------------------------------------------------------------------------
-- RLS — locked
-- ----------------------------------------------------------------------------

alter table public.rate_limit_counters enable row level security;
-- Intentionally NO policies. Every direct client read/write returns zero rows
-- / is rejected. The only legitimate write path is the security-definer
-- function below.

-- ----------------------------------------------------------------------------
-- try_consume_rate_limit — atomic increment + cap check
--
-- Returns true when the caller is still under cap (and the increment was
-- applied), false when the cap is exceeded (and the increment was still
-- applied — the next call after the window rolls over starts a fresh
-- bucket, so we do not need to "rollback" the over-the-cap increment).
--
-- The function is security definer (so it can write past RLS) but is GRANTed
-- to `authenticated` so a Server Action holding the user's session cookie
-- can call it directly without needing the secret/service-role key.
-- p_profile_id is passed in explicitly rather than read from auth.uid()
-- inside the function body, so the call site is in charge of "whose limit"
-- this is — no hidden coupling to session state inside the SQL.
-- ----------------------------------------------------------------------------

create or replace function public.try_consume_rate_limit(
  p_profile_id     uuid,
  p_surface        text,
  p_max            integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_new_count    integer;
begin
  if p_max < 1 then
    raise exception 'try_consume_rate_limit: p_max must be >= 1 (got %)', p_max;
  end if;

  -- Bucket the current time to the window boundary. p_window_seconds <= 0
  -- means "no window" (every call is its own bucket) — useful in tests to
  -- prove the bucket logic resets.
  if p_window_seconds <= 0 then
    v_window_start := now();
  else
    v_window_start := to_timestamp(
      floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
    );
  end if;

  insert into public.rate_limit_counters (profile_id, surface, window_start, count)
  values (p_profile_id, p_surface, v_window_start, 1)
  on conflict (profile_id, surface, window_start) do update
    set count = public.rate_limit_counters.count + 1
  returning count into v_new_count;

  return v_new_count <= p_max;
end;
$$;

revoke all on function public.try_consume_rate_limit(uuid, text, integer, integer) from public;
grant execute on function public.try_consume_rate_limit(uuid, text, integer, integer)
  to authenticated, service_role;
