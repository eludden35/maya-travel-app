-- =============================================================================
-- trips + trip_members: Trip entity with visibility model + binary membership
--                       roles. Bead tripplanner-s3a.3.
--
-- Threat model (per .cursor/skills/project-architecture/SKILL.md):
--
--   1. Who can READ trips?
--      - Anonymous + authenticated: rows where visibility in ('public',
--        'unlisted'). The `unlisted` branch is visible to anyone who sends
--        a query for that specific trip id; list queries (without an id
--        predicate) return zero unlisted rows to non-members because callers
--        do not know the ids. The explore tab (s3a.11) explicitly filters
--        `visibility = 'public'`, so unlisted trips never appear there. UUID
--        is the gate (122 bits of entropy); a separate share_token would add
--        a column + index + rotation surface that the AC does not ask for.
--      - Members of the trip: always see the trip regardless of visibility,
--        via the `exists (select 1 from trip_members ...)` branch.
--      - Anonymous trying to read a `private` trip → 0 rows.
--      - Authenticated non-member trying to read a `private` trip → 0 rows.
--
--   2. Who can READ trip_members?
--      - Members of the trip only — even on a public trip. The membership
--        list is members-only to avoid leaking who-is-going to the world.
--        The explore tab will surface "X people are going" via an aggregate
--        count (s3a.11), never by exposing individual rows.
--
--   3. Who can WRITE trips?
--      - INSERT: only the caller, with themselves as organizer. The matching
--        `trip_members` row for the organizer lands in the same transaction
--        as the trips insert (organizer-self-bootstrap is allowed because
--        the trip-side INSERT just succeeded under the same caller).
--        UI surface ships in s3a.26.
--      - UPDATE: only the organizer. Members cannot rename a trip or flip
--        its visibility.
--      - DELETE: only the organizer. `on delete cascade` from trip_members
--        and (future) child tables lands when those tables ship.
--
--   4. Who can WRITE trip_members?
--      - INSERT: the trip's organizer (adding members). Self-join (a
--        non-member adding themselves) is OUT in this chunk — s3a.12 owns
--        the join-request flow. This policy already supports the s3a.26
--        bootstrap (organizer adds themselves while creating the trip)
--        because the caller is the just-created trip's organizer.
--      - DELETE: a member can remove themselves (== leave); the organizer
--        can remove any non-organizer member (== remove). The organizer
--        CANNOT delete their own organizer row — they must transfer the
--        organizer role first (separate, deliberate flow that is not at
--        MVP).
--      - UPDATE: not allowed at MVP. Role transfer is a deliberate flow.
--
--   5. What if someone outside that set sends the request anyway?
--      - SELECT outside the visibility branch returns 0 rows (RLS).
--      - INSERT / UPDATE / DELETE outside the policy is rejected by RLS.
--
--   6. Logs / PII?
--      - trips: name, optional description, optional dates, organizer FK,
--        visibility, timestamps. No PII beyond what is already in profiles.
--      - trip_members: two FKs + role + timestamp. No PII beyond profiles.
--
-- ----------------------------------------------------------------------------
-- HARD RULE — money privacy (ADR 0002, supabase-security.mdc):
--
--   Money data is NEVER readable by non-trip-members regardless of trip
--   visibility, follower relationship, or any other social grant. The
--   `trips_select_*` policies in this migration expose trip metadata only —
--   they do NOT, and never will, reference monetary tables or monetary
--   columns. Future monetary tables will ship their OWN member-only RLS
--   policies (`exists (select 1 from trip_members tm where tm.trip_id =
--   ... and tm.profile_id = auth.uid())`) and will NOT branch on
--   `trips.visibility`. This migration body deliberately avoids naming
--   the monetary tables and monetary column names so the verification
--   `rg` (run by the parent agent per the s3a.3 plan §7) returns zero
--   matches against the canonical forbidden list. The list itself lives
--   in `.cursor/rules/supabase-security.mdc` (hard-rule §1) and
--   `docs/adr/0002-social-vision-pivot.md` (Money privacy).
--
-- ----------------------------------------------------------------------------
-- HARD RULE — image pre-moderation (ADR 0002, supabase-security.mdc):
--
--   No image columns ship in this migration. Posts (s3a.7) will join to
--   `trips.visibility` for the visibility branch AND to `images.state =
--   'approved'` for the pre-moderation branch. Public visibility never
--   relaxes the pre-moderation gate.
--
-- ----------------------------------------------------------------------------
-- Migration immutability — closing the co-trip-members seam from s3a.1/s3a.2:
--
--   The s3a.1 migration shipped `profiles_select_discoverable_or_self`
--   without the co-trip-members branch because `trip_members` did not yet
--   exist. The s3a.2 migration drop-and-recreated that policy adding the
--   follower branch but left the co-trip-members branch deferred. Now that
--   `trip_members` exists, this migration drops and recreates that policy a
--   second time to wire the third branch. The historical migrations
--   (`20260419013009_profiles.sql` and `20260419045026_follows.sql`) are
--   intentionally NOT modified — applied migrations are immutable record
--   (Supabase tracks each by file hash). Same pattern as
--   `20260419050000_blocks_mutes.sql` (s3a.16) used to close the s3a.2
--   block-check seam.
--
-- ----------------------------------------------------------------------------
-- Open consumers (deferred — file as follow-up Beads, do NOT silently land):
--
--   - posts (tripplanner-s3a.7): select policy joins to trips.visibility
--     for the visibility branch AND to images.state = 'approved' for the
--     pre-moderation branch.
--   - comments + reactions (tripplanner-s3a.8): same visibility join.
--   - followers feed (tripplanner-s3a.10): respects trip visibility +
--     membership AND the existing mute filter from s3a.16.
--   - explore tab (tripplanner-s3a.11): `visibility = 'public'` filter,
--     never exposes individual trip_members rows; aggregate counts only.
--   - join_requests (tripplanner-s3a.12): owns its own `auto_approve`
--     toggle column, NOT in this migration. trip_id FK lives there.
--   - DMs (tripplanner-s3a.13): can_dm()'s shared-trip leg queries
--     trip_members.
--   - trip create + trip detail page (tripplanner-s3a.26 — new, blocks
--     this Bead): write helpers in lib/trips.ts + Server Actions in
--     app/_actions/trips-actions.ts + page at /trips/[id]. Home-page rows
--     from this chunk become real <Link href="/trips/{id}" /> after that
--     ships.
--   - Block check on trip READ policies — kept at the application layer
--     (lib/trips.ts and the future explore-side helper), NOT in RLS.
--     Justification in the plan file at .cursor/plans/s3a03_trip_visibility.plan.md
--     section 3 → "Threat model" → #7.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

create type public.trip_visibility as enum ('private', 'unlisted', 'public');

create type public.trip_member_role as enum ('organizer', 'member');

-- ----------------------------------------------------------------------------
-- trips
-- ----------------------------------------------------------------------------

create table public.trips (
  id           uuid primary key default gen_random_uuid(),
  organizer_id uuid not null
                 references public.profiles(id) on delete restrict,
  name         text not null
                 check (length(name) between 1 and 120),
  description  text
                 check (description is null or length(description) <= 2000),
  start_date   date,
  end_date     date,
  visibility   public.trip_visibility not null default 'private',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

comment on table public.trips is
  'Trip entity. visibility ∈ (private | unlisted | public) — see ADR 0002. Money data is NEVER readable by non-members regardless of visibility (supabase-security.mdc hard rule).';
comment on column public.trips.organizer_id is
  'FK to profiles. on delete restrict — deleting an organizer profile while they own trips is refused; transfer organizer first (separate flow).';
comment on column public.trips.visibility is
  'private (default — members only) | unlisted (link-as-gate, knowing the UUID grants read) | public (world-readable metadata; explore tab; accepts join requests). Money is NEVER exposed by any visibility level.';

-- Reverse-direction lookups + the public-trips fast path for s3a.11's explore
-- query. The PK already covers id-equality lookups for getTripById.
create index trips_visibility_public_idx
  on public.trips (visibility) where visibility = 'public';
create index trips_organizer_id_idx
  on public.trips (organizer_id);
create index trips_created_at_idx
  on public.trips (created_at desc);

create trigger trips_set_updated_at
  before update on public.trips
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- trip_members
-- ----------------------------------------------------------------------------

create table public.trip_members (
  trip_id    uuid not null
               references public.trips(id) on delete cascade,
  profile_id uuid not null
               references public.profiles(id) on delete cascade,
  role       public.trip_member_role not null default 'member',
  joined_at  timestamptz not null default now(),
  primary key (trip_id, profile_id)
);

comment on table public.trip_members is
  'Trip membership. role ∈ (organizer | member) at MVP. Membership grants read on trip-derived content (posts, etc.) per their own visibility branches. Money tables grant read on membership ALONE — never on trips.visibility.';
comment on column public.trip_members.role is
  'Binary at MVP: organizer | member. Exactly one organizer per trip is enforced by the trip_members_one_organizer_per_trip partial unique index below. Adding co-organizer later requires dropping that index in a new migration.';

-- Exactly one organizer per trip at MVP. If co-organizer ever lands, this
-- partial unique index goes away in the new migration (and the
-- trip_members_delete_self_or_by_organizer policy gets revisited).
create unique index trip_members_one_organizer_per_trip
  on public.trip_members (trip_id) where role = 'organizer';

-- The PK already covers (trip_id, ...) for "who is in this trip?". The
-- reverse-direction index supports "what trips is this profile in?", which
-- is the exact query listTripsForViewer issues.
create index trip_members_profile_id_idx
  on public.trip_members (profile_id);

-- ----------------------------------------------------------------------------
-- RLS — trips
-- ----------------------------------------------------------------------------

alter table public.trips enable row level security;

-- SELECT: public + unlisted trips are returned to anyone whose query reaches
-- the row (knowing the id of an unlisted trip is the gate); private trips
-- require membership. The unlisted branch leaks nothing in practice because
-- list queries don't know the ids; the explore-tab query (s3a.11) explicitly
-- filters `where visibility = 'public'`, so unlisted trips never appear in
-- discovery surfaces.
create policy "trips_select_visible"
  on public.trips
  for select
  to authenticated, anon
  using (
    visibility in ('public', 'unlisted')
    or exists (
      select 1 from public.trip_members tm
      where tm.trip_id = trips.id
        and tm.profile_id = auth.uid()
    )
  );

-- INSERT: only the caller can create a trip with themselves as organizer.
-- No UI in this chunk; the policy ships so s3a.26's create flow can lean
-- on it. Server Actions in s3a.26 will set organizer_id = auth.uid() and
-- insert the matching trip_members row in the same transaction.
create policy "trips_insert_organizer_self"
  on public.trips
  for insert
  to authenticated
  with check (auth.uid() = organizer_id);

-- UPDATE: only the organizer can change anything (name, description, dates,
-- visibility). Members cannot rename the trip or flip its visibility. The
-- with-check clause prevents an organizer from re-pointing organizer_id at
-- someone else without going through a transfer flow.
create policy "trips_update_organizer"
  on public.trips
  for update
  to authenticated
  using (auth.uid() = organizer_id)
  with check (auth.uid() = organizer_id);

-- DELETE: only the organizer.
create policy "trips_delete_organizer"
  on public.trips
  for delete
  to authenticated
  using (auth.uid() = organizer_id);

-- ----------------------------------------------------------------------------
-- RLS — trip_members
-- ----------------------------------------------------------------------------

alter table public.trip_members enable row level security;

-- SELECT: members of a trip can see all members of the same trip. Non-members
-- get zero rows even on a public trip. The "X people are going" aggregate on
-- the explore tab (s3a.11) ships separately and never exposes individuals.
create policy "trip_members_select_co_members"
  on public.trip_members
  for select
  to authenticated
  using (
    exists (
      select 1 from public.trip_members self
      where self.trip_id = trip_members.trip_id
        and self.profile_id = auth.uid()
    )
  );

-- INSERT: the organizer can add members to their own trip. Self-join (a
-- non-member adding themselves) is OUT in this chunk — s3a.12 owns the
-- join-request flow. This policy supports the s3a.26 bootstrap (organizer
-- adds themselves while creating the trip) because by then the caller IS
-- the just-created trip's organizer.
create policy "trip_members_insert_by_organizer"
  on public.trip_members
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.trips t
      where t.id = trip_members.trip_id
        and t.organizer_id = auth.uid()
    )
  );

-- DELETE: a member can remove themselves (== leave); the organizer can
-- remove a non-organizer member (== remove). The organizer CANNOT delete
-- their own organizer row — they must transfer organizer first (separate
-- flow). Both branches forbid deleting an organizer row.
create policy "trip_members_delete_self_or_by_organizer"
  on public.trip_members
  for delete
  to authenticated
  using (
    (
      profile_id = auth.uid()
      and role <> 'organizer'
    )
    or
    (
      role <> 'organizer'
      and exists (
        select 1 from public.trips t
        where t.id = trip_members.trip_id
          and t.organizer_id = auth.uid()
      )
    )
  );

-- No UPDATE policy. Role changes (member → organizer transfer) are a
-- deliberate flow that lands when needed, not at MVP.

-- ----------------------------------------------------------------------------
-- profiles_select_discoverable_or_self: extend with the co-trip-members branch
--
-- The s3a.1 migration shipped this policy without the co-trip-members branch
-- because trip_members did not exist yet. The s3a.2 migration drop-and-
-- recreated it adding the follower branch but left the co-trip-members
-- branch deferred (see the headers of 20260419013009_profiles.sql and
-- 20260419045026_follows.sql for the historical record). Now that
-- trip_members exists, drop and recreate a second time to wire the third
-- branch.
--
-- The historical 20260419013009_profiles.sql and 20260419045026_follows.sql
-- migrations are intentionally NOT modified — applied migrations are
-- immutable (Supabase tracks each by file hash). This drop-and-recreate
-- supersedes the historical policy at the database level. Same pattern as
-- 20260419050000_blocks_mutes.sql (s3a.16) used to close the s3a.2 block-
-- check seam.
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
      select 1 from public.follows
      where follower_id = auth.uid()
        and followee_id = profiles.id
    )
    or exists (
      select 1
      from public.trip_members viewer_tm
      join public.trip_members other_tm
        on viewer_tm.trip_id = other_tm.trip_id
      where viewer_tm.profile_id = auth.uid()
        and other_tm.profile_id = profiles.id
    )
  );
