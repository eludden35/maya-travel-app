-- =============================================================================
-- blocks + mutes: relational substrate for symmetric block (Instagram-style)
--                 and one-way mute. Bead tripplanner-s3a.16.
--
-- Threat model (per .cursor/skills/project-architecture/SKILL.md):
--
--   1. Who can READ this data?
--      - blocks: only the blocker (auth.uid() = blocker_id). The blocked party
--        CANNOT see they were blocked — symmetric invisibility means the
--        blocked profile simply disappears from discovery / feeds, not that
--        the blocked user gets a "you were blocked" notice.
--      - mutes:  only the muter  (auth.uid() = muter_id). Mute is intentionally
--        invisible to the muted; surfacing a mute would defeat the affordance.
--
--   2. Who can WRITE this data?
--      - The actor (blocker / muter) only. INSERT and DELETE keyed to
--        auth.uid(). No UPDATE policy — a (blocker, blocked) edge is
--        immutable; to "change" it you delete and re-insert.
--      - Self-block / self-mute blocked at three layers: CHECK constraint,
--        RLS with-check, and Server Action validation. Defense in depth.
--
--   3. What if someone outside that set sends the request anyway?
--      - SELECT as the blocked / muted party returns no rows (RLS).
--      - INSERT with someone else's blocker_id / muter_id rejected by with-check.
--      - INSERT where blocker_id = blocked_id (or muter_id = muted_id) rejected
--        by CHECK + RLS.
--      - DELETE on someone else's row rejected by using.
--      - UPDATE rejected by absence of any update policy.
--
--   4. Logs / PII?
--      - blocks / mutes hold nothing but two profile UUIDs and a timestamp.
--        No PII beyond what already lives in profiles. No money. The money-
--        privacy hard-rule (money never readable by non-trip-members) is
--        unaffected: nothing in this migration touches monetary tables.
--
--   5. Open consumers (deferred — file as follow-up Beads, do NOT silently land):
--      - DM insert policy (tripplanner-s3a.13): dm_messages insert must check
--        both directions of blocks.
--      - Feed read policy (tripplanner-s3a.10): must filter out blocks (either
--        direction) AND mutes (one direction — the muter's view).
--      - Explore read policy (tripplanner-s3a.8): same as feed.
--      - profiles_select_discoverable_or_self extension (tripplanner-s3a.23):
--        add `and not exists (select 1 from blocks where ...)` so a blocked
--        profile becomes invisible to the blocked party in profile reads.
--
-- This migration ALSO drops and recreates follows_insert_self to wire the
-- block-check branch the s3a.2 migration honest-deferred via TODO(s3a.16)
-- in 20260419045026_follows.sql. That historical TODO is intentionally
-- left in place — applied migrations are immutable record. The drop-and-
-- recreate below supersedes the historical policy at the database level.
-- Doing it in the same migration as the blocks table keeps the substrate-
-- and-its-consumer in lockstep (per .cursor/rules/supabase-security.mdc
-- "RLS in same migration as table"). The block-trumps-follow trigger below
-- is the second enforcement layer: even if a follow edge slips in (e.g.
-- legacy row, future policy bug), inserting a block atomically removes any
-- follow edge in either direction.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- blocks
-- ----------------------------------------------------------------------------

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

comment on table public.blocks is
  'Symmetric-invisibility blocks. Only the blocker can read their own rows; the blocked party never learns of the block. (blocker_id, blocked_id) is the natural composite key. See header for threat model + open consumers.';

-- The PK already covers the (blocker_id, ...) prefix, which answers
-- "who has X blocked?". Add an index on blocked_id for the reverse direction
-- — "is anyone blocking me?" — needed by the follows_insert_self policy's
-- bidirectional EXISTS check below and by future feed/explore read policies.
create index blocks_blocked_id_idx
  on public.blocks (blocked_id);

-- ----------------------------------------------------------------------------
-- mutes
-- ----------------------------------------------------------------------------

create table public.mutes (
  muter_id   uuid not null references public.profiles(id) on delete cascade,
  muted_id   uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id),
  check (muter_id <> muted_id)
);

comment on table public.mutes is
  'One-way mutes (only affect the muter''s feed/explore reads — does not change writability or visibility for the muted party). Only the muter can read their own rows. (muter_id, muted_id) is the natural composite key. See header for threat model + open consumers.';

-- PK covers (muter_id, ...) for "who has X muted?". The reverse direction
-- ("who has muted me?") is intentionally never needed by app code — mute is
-- invisible to the muted party — so no muted_id index.

-- ----------------------------------------------------------------------------
-- RLS — blocks
-- ----------------------------------------------------------------------------

alter table public.blocks enable row level security;

-- Only the blocker sees their own block list. The blocked party gets zero rows.
create policy "blocks_select_own"
  on public.blocks
  for select
  to authenticated
  using (auth.uid() = blocker_id);

-- Insert your own block edge only. Self-block blocked here AND by the table
-- CHECK constraint; both layers stay because either alone is insufficient
-- (RLS bypass for service-role still hits the CHECK; a future migration that
-- relaxes the CHECK still hits RLS).
create policy "blocks_insert_own"
  on public.blocks
  for insert
  to authenticated
  with check (
    auth.uid() = blocker_id
    and blocker_id <> blocked_id
  );

-- Unblock: only the blocker can delete their own edge.
create policy "blocks_delete_own"
  on public.blocks
  for delete
  to authenticated
  using (auth.uid() = blocker_id);

-- No UPDATE policy. Block edges are immutable.

-- ----------------------------------------------------------------------------
-- RLS — mutes (identical shape, swap the column names)
-- ----------------------------------------------------------------------------

alter table public.mutes enable row level security;

create policy "mutes_select_own"
  on public.mutes
  for select
  to authenticated
  using (auth.uid() = muter_id);

create policy "mutes_insert_own"
  on public.mutes
  for insert
  to authenticated
  with check (
    auth.uid() = muter_id
    and muter_id <> muted_id
  );

create policy "mutes_delete_own"
  on public.mutes
  for delete
  to authenticated
  using (auth.uid() = muter_id);

-- ----------------------------------------------------------------------------
-- Block trumps follow: AFTER INSERT trigger on blocks
--
-- When a block row is created, atomically delete any follow edge in either
-- direction between the two parties. This is the symmetric-invisibility
-- guarantee at the data layer — it cannot be skipped from the client.
--
-- Security justification for SECURITY DEFINER:
--   - The trigger only fires from a successful blocks insert, which is itself
--     RLS-checked (blocks_insert_own requires auth.uid() = blocker_id). So the
--     elevated privilege is bounded by "this caller already proved they own
--     the blocker side of this edge".
--   - The blocker can already delete their own outbound follow edge under
--     follows_delete_self. The privilege escalation here is solely the ability
--     to delete the OTHER party's inbound follow edge to the blocker. That is
--     exactly the symmetric-invisibility intent: "they unfollow you too".
--   - search_path is pinned to public so a malicious schema search-path
--     cannot redirect public.follows / public.blocks to attacker-owned tables.
-- ----------------------------------------------------------------------------

create or replace function public.blocks_revoke_follows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.follows
  where (follower_id = NEW.blocker_id and followee_id = NEW.blocked_id)
     or (follower_id = NEW.blocked_id and followee_id = NEW.blocker_id);
  return NEW;
end;
$$;

comment on function public.blocks_revoke_follows() is
  'AFTER INSERT trigger on blocks: deletes any follow edge in either direction between blocker and blocked. SECURITY DEFINER is required to delete the other party''s inbound edge; the privilege is bounded by the RLS-checked blocks insert that fires the trigger. See blocks migration header.';

create trigger blocks_revoke_follows_trg
  after insert on public.blocks
  for each row
  execute function public.blocks_revoke_follows();

-- ----------------------------------------------------------------------------
-- follows_insert_self: extend with the bidirectional block check
--
-- The s3a.2 migration shipped this policy with a deferral marker because the
-- blocks table didn't exist yet. Now that it does, drop-and-recreate to wire
-- the block branch. This closes the seam called out in
-- 20260419045026_follows.sql.
-- ----------------------------------------------------------------------------

drop policy "follows_insert_self" on public.follows;

create policy "follows_insert_self"
  on public.follows
  for insert
  to authenticated
  with check (
    auth.uid() = follower_id
    and follower_id <> followee_id
    and not exists (
      select 1 from public.blocks
      where (blocker_id = auth.uid() and blocked_id = followee_id)
         or (blocker_id = followee_id and blocked_id = auth.uid())
    )
  );
