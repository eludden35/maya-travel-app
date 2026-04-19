-- =============================================================================
-- follows: asymmetric follow graph (Instagram-style: A->B does not imply B->A)
--          + extension of profiles_select_discoverable_or_self with the
--          follower-exists branch deferred from 20260419013009_profiles.sql.
--          Bead tripplanner-s3a.2.
--
-- Threat model (per .cursor/skills/project-architecture/SKILL.md):
--
--   1. Who can READ this data?
--      - Anyone (anon + authenticated): all rows. Follow edges are public-by-
--        default per the social MVP framing in ADR 0002. Per-profile
--        "who-can-see-my-followers" privacy is post-MVP.
--
--   2. Who can WRITE this data?
--      - The follower: insert a row where follower_id = auth.uid().
--      - The follower: delete a row where follower_id = auth.uid() (unfollow).
--      - Edges are immutable: no UPDATE policy.
--      - The followee CANNOT remove a follower at MVP (Instagram's "remove
--        follower" affordance is a UI nicety not in scope; would be filed as a
--        discovered-from follow-up Bead if needed).
--      - Self-follow blocked at three layers: CHECK constraint, RLS with-check,
--        and Server Action validation. Defense in depth.
--      - Block check (AC line "Cannot follow if either side has blocked the
--        other") is honest-deferred to tripplanner-s3a.16 (blocks + mutes
--        primitives). The follows_insert_self policy carries a TODO(s3a.16)
--        marker so the seam is grep-able; when s3a.16 ships, its migration
--        extends this policy with `and not exists (select 1 from blocks ...)`
--        in either direction. A note on s3a.16 mirrors this.
--
--   3. What if someone outside that set sends the request anyway?
--      - INSERT with someone else's follower_id rejected by RLS with-check.
--      - INSERT where follower_id = followee_id rejected by CHECK + RLS.
--      - DELETE on someone else's follow edge rejected by RLS using.
--      - UPDATE rejected by absence of any update policy.
--
--   4. Logs / PII?
--      - follows holds nothing but two profile UUIDs and a timestamp. No PII
--        beyond what already lives in profiles. No money. The money-privacy
--        hard-rule (money never readable by non-trip-members) is unaffected:
--        nothing in this migration touches monetary tables.
--
-- This migration ALSO drops and recreates profiles_select_discoverable_or_self
-- to wire the follower-exists branch the s3a.1 migration deferred. Doing this
-- in the same migration as the follows table keeps the substrate-and-its-
-- consumer in lockstep (per .cursor/rules/supabase-security.mdc "RLS in same
-- migration as table"). The co-trip-members branch stays deferred until
-- trip_members ships.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Table
-- ----------------------------------------------------------------------------

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

comment on table public.follows is
  'Asymmetric follow edges. (follower_id, followee_id) is the natural composite key. World-readable per ADR 0002. See header for threat model.';

-- ----------------------------------------------------------------------------
-- Indexes
--
-- The PK already covers (follower_id, followee_id) and the (follower_id, ...)
-- prefix, which answers "who does X follow?". Add a separate index on
-- followee_id for "who follows X?" queries (the AC explicitly calls out both
-- directions). The (followee_id, created_at desc) compound index supports
-- "show me my recent followers" notification ordering.
-- ----------------------------------------------------------------------------

create index follows_followee_id_idx
  on public.follows (followee_id);

create index follows_followee_created_idx
  on public.follows (followee_id, created_at desc);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.follows enable row level security;

-- Anyone can read follow edges (Instagram-style; see ADR 0002).
create policy "follows_select_all"
  on public.follows
  for select
  to authenticated, anon
  using (true);

-- Insert your own follow edge only. Self-follow blocked here AND by the table
-- CHECK constraint; both layers stay because either alone is insufficient
-- (RLS bypass for service-role still hits the CHECK; a future migration that
-- relaxes the CHECK still hits RLS).
--
-- TODO(s3a.16): when blocks + mutes ship, extend this policy with
--   and not exists (
--     select 1 from public.blocks
--     where (blocker_id = auth.uid() and blocked_id = followee_id)
--        or (blocker_id = followee_id and blocked_id = auth.uid())
--   )
-- The s3a.16 migration owns that extension; a note on the s3a.16 Bead body
-- mirrors this requirement.
create policy "follows_insert_self"
  on public.follows
  for insert
  to authenticated
  with check (
    auth.uid() = follower_id
    and follower_id <> followee_id
  );

-- Unfollow: only the follower can delete their own edge.
create policy "follows_delete_self"
  on public.follows
  for delete
  to authenticated
  using (auth.uid() = follower_id);

-- No UPDATE policy. Follow edges are immutable.

-- ----------------------------------------------------------------------------
-- profiles_select_discoverable_or_self: extend with follower branch
--
-- The s3a.1 migration shipped this policy without the follower branch because
-- the follows table didn't exist yet. Now that it does, drop-and-recreate to
-- wire the branch. The co-trip-members branch is still deferred (no
-- trip_members table yet); when that lands, that migration will drop-and-
-- recreate this policy a second time to add the third branch.
-- ----------------------------------------------------------------------------

drop policy "profiles_select_discoverable_or_self" on public.profiles;

create policy "profiles_select_discoverable_or_self"
  on public.profiles
  for select
  to authenticated, anon
  using (
    is_discoverable = true
    or auth.uid() = id
    or exists (
      select 1
      from public.follows
      where follower_id = auth.uid()
        and followee_id = profiles.id
    )
    -- co-trip-members branch deferred until trip_members ships
    -- (see header of 20260419013009_profiles.sql).
  );
