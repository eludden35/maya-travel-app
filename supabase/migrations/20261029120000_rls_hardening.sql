-- =============================================================================
-- rls_hardening: corrective migration from the 2026-10-29 UAT readiness review.
-- Applied migrations are immutable, so every fix lands here. Each numbered
-- finding has a matching pgTAP file under supabase/tests/database/.
--
--   1. P0  trip_members' read policy queried trip_members itself, so every
--          signed-in read of profiles, trips and trip_members raised 42P17
--          "infinite recursion detected in policy".
--          -> Membership and block checks move into security-definer helpers
--             in a `private` schema; policies call the helpers.
--   2. P0  profiles_insert_self let any account insert its own profile with
--          is_moderator = true; the guard trigger only ran on UPDATE.
--          -> Clients lose INSERT on profiles and keep UPDATE on three
--             columns. complete_onboarding() is the only way in, and the
--             guard trigger also runs on INSERT.
--   3. P1  "unlisted" trips were returned by list queries, so the
--          publishable key could enumerate them.
--          -> Table reads return public trips plus your own. get_trip(id)
--             opens one unlisted trip by exact id.
--   4. P1  The follow policy's "they blocked me" branch ran under the
--          caller's RLS on blocks and never matched.
--          -> private.blocked_either_way() checks both directions, and a
--             blocked user no longer sees the blocker's profile.
--   5. P1  try_consume_rate_limit() trusted a caller-supplied profile id and
--          limits, and anon could call it.
--          -> consume_rate_limit(surface) charges auth.uid() and reads its
--             limits from private.rate_limit_rules.
--   6. P1  Clients could upload into images-pending and insert their own
--          pending_review rows, skipping the server-side EXIF strip. The
--          buckets had no limits, and anon could list images-approved.
--   7. P1  Private trips could not be created (no organizer read branch),
--          and an organizer could add anyone to a trip without consent.
--          -> Organizer read branch; the organizer's membership row comes
--             from a trigger; clients cannot insert trip_members (invite
--             acceptance lands with the invite-links migration).
--   8. P1  Onboarding wrote the profile and the ToS acceptance in two calls.
--          -> complete_onboarding() does rate limit + profile + ToS in one
--             transaction.
--   Also: every trigger and definer function pins search_path, and clients
--   can no longer set profiles.created_at or tos_acceptances.accepted_at.
--
-- Behaviour change, recorded as a product default on 2026-10-29: a profile
-- with is_discoverable = false is visible to itself, its trip co-members and
-- the people IT follows. Following someone no longer reveals a hidden profile.
--
-- Money-privacy hard rule (ADR 0002): no monetary tables exist yet and none
-- are touched here.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- private schema: helpers for policies and RPCs. Only `public` and
-- `graphql_public` are exposed through the Data API, so nothing here can be
-- called over REST. anon and authenticated need USAGE + EXECUTE because
-- policies run as the caller.
-- ----------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

comment on schema private is
  'Helpers for RLS policies and RPCs. Not exposed through the Data API. See 20261029120000_rls_hardening.sql.';

-- Security definer + search_path = '': each helper runs as the table owner,
-- which bypasses RLS on the tables it reads (none use FORCE ROW LEVEL
-- SECURITY), so a policy calling it can never recurse. Each takes identity
-- only from auth.uid(), never from an argument.

create or replace function private.is_trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = p_trip_id
      and tm.profile_id = (select auth.uid())
  );
$$;

create or replace function private.is_trip_organizer(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trips t
    where t.id = p_trip_id
      and t.organizer_id = (select auth.uid())
  );
$$;

create or replace function private.shares_trip_with(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trip_members viewer
    join public.trip_members other on other.trip_id = viewer.trip_id
    where viewer.profile_id = (select auth.uid())
      and other.profile_id = p_profile_id
  );
$$;

-- Has p_profile_id blocked the caller? Hides the blocker from the blocked.
create or replace function private.has_blocked_me(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.blocks b
    where b.blocker_id = p_profile_id
      and b.blocked_id = (select auth.uid())
  );
$$;

create or replace function private.blocked_either_way(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.blocks b
    where (b.blocker_id = (select auth.uid()) and b.blocked_id = p_profile_id)
       or (b.blocker_id = p_profile_id and b.blocked_id = (select auth.uid()))
  );
$$;

revoke all on function private.is_trip_member(uuid) from public;
revoke all on function private.is_trip_organizer(uuid) from public;
revoke all on function private.shares_trip_with(uuid) from public;
revoke all on function private.has_blocked_me(uuid) from public;
revoke all on function private.blocked_either_way(uuid) from public;
grant execute on function private.is_trip_member(uuid) to anon, authenticated, service_role;
grant execute on function private.is_trip_organizer(uuid) to anon, authenticated, service_role;
grant execute on function private.shares_trip_with(uuid) to anon, authenticated, service_role;
grant execute on function private.has_blocked_me(uuid) to anon, authenticated, service_role;
grant execute on function private.blocked_either_way(uuid) to anon, authenticated, service_role;

-- is_moderator(uuid) is called by seven existing policies as
-- is_moderator(auth.uid()), and anon can call it over REST. It now answers
-- only about the caller, so it can no longer be used to find moderators.
-- Same signature, so those policies keep working unchanged.
create or replace function public.is_moderator(profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select is_moderator.profile_id = (select auth.uid())
     and coalesce(
       (select p.is_moderator from public.profiles p where p.id = is_moderator.profile_id),
       false
     );
$$;

-- ----------------------------------------------------------------------------
-- Finding 2: profiles writes.
-- ----------------------------------------------------------------------------

create or replace function public.profiles_prevent_privilege_escalation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.id is distinct from old.id then
    raise exception 'profiles.id is immutable' using errcode = '42501';
  end if;

  -- Server-side callers (dashboard SQL, the secret key, migrations) carry no
  -- end-user identity and may set anything else.
  if (select auth.uid()) is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_moderator := false;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if new.is_moderator is distinct from old.is_moderator then
    raise exception 'is_moderator can only be changed by an administrator'
      using errcode = '42501';
  end if;
  if new.handle is distinct from old.handle then
    raise exception 'handles cannot be changed' using errcode = '42501';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'profiles.created_at is immutable' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_no_privilege_escalation on public.profiles;
create trigger profiles_no_privilege_escalation
  before insert or update on public.profiles
  for each row execute function public.profiles_prevent_privilege_escalation();

-- Column privileges are the first line: clients can only ever change these
-- three columns. The trigger above is the second.
revoke insert, update on table public.profiles from anon, authenticated;
grant update (display_name, bio, is_discoverable) on table public.profiles to authenticated;

drop policy if exists "profiles_insert_self" on public.profiles;

-- ----------------------------------------------------------------------------
-- Findings 1, 3, 7: trips and trip_members.
-- ----------------------------------------------------------------------------

drop policy if exists "trip_members_select_co_members" on public.trip_members;
create policy "trip_members_select_co_members"
  on public.trip_members
  for select
  to authenticated
  using (private.is_trip_member(trip_id));

-- Organizers no longer add arbitrary profile ids. Membership rows come from
-- the trigger below (organizer) and, in a later migration, from accepting an
-- invite.
drop policy if exists "trip_members_insert_by_organizer" on public.trip_members;

drop policy if exists "trip_members_delete_self_or_by_organizer" on public.trip_members;
create policy "trip_members_delete_self_or_by_organizer"
  on public.trip_members
  for delete
  to authenticated
  using (
    role = 'member'
    and (
      profile_id = (select auth.uid())
      or private.is_trip_organizer(trip_id)
    )
  );

drop policy if exists "trips_select_visible" on public.trips;
create policy "trips_select_visible"
  on public.trips
  for select
  to authenticated, anon
  using (
    visibility = 'public'
    or organizer_id = (select auth.uid())
    or private.is_trip_member(id)
  );

create or replace function private.trips_add_organizer_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.trip_members (trip_id, profile_id, role)
  values (new.id, new.organizer_id, 'organizer')
  on conflict (trip_id, profile_id) do nothing;
  return new;
end;
$$;

revoke all on function private.trips_add_organizer_membership() from public, anon, authenticated;

create trigger trips_add_organizer_membership
  after insert on public.trips
  for each row execute function private.trips_add_organizer_membership();

-- Backfill any trip that never got its organizer row.
insert into public.trip_members (trip_id, profile_id, role)
select t.id, t.organizer_id, 'organizer'
from public.trips t
where not exists (
  select 1
  from public.trip_members tm
  where tm.trip_id = t.id
    and tm.role = 'organizer'
)
on conflict (trip_id, profile_id) do nothing;

-- Opens one trip by exact id: public and unlisted trips for anyone, private
-- trips for their members. This is the only read path for unlisted trips.
create or replace function public.get_trip(p_trip_id uuid)
returns setof public.trips
language sql
stable
security definer
set search_path = ''
as $$
  select t.*
  from public.trips t
  where t.id = p_trip_id
    and (
      t.visibility in ('public', 'unlisted')
      or t.organizer_id = (select auth.uid())
      or private.is_trip_member(t.id)
    );
$$;

revoke all on function public.get_trip(uuid) from public;
grant execute on function public.get_trip(uuid) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Findings 1, 4: profiles read and follows insert.
-- ----------------------------------------------------------------------------

drop policy if exists "follows_insert_self" on public.follows;
create policy "follows_insert_self"
  on public.follows
  for insert
  to authenticated
  with check (
    follower_id = (select auth.uid())
    and follower_id <> followee_id
    and not private.blocked_either_way(followee_id)
  );

drop policy if exists "profiles_select_discoverable_or_self" on public.profiles;
create policy "profiles_select_discoverable_or_self"
  on public.profiles
  for select
  to authenticated, anon
  using (
    id = (select auth.uid())
    or (
      not private.has_blocked_me(id)
      and (
        is_discoverable
        or exists (
          select 1
          from public.follows f
          where f.follower_id = profiles.id
            and f.followee_id = (select auth.uid())
        )
        or private.shares_trip_with(id)
      )
    )
  );

-- ----------------------------------------------------------------------------
-- Finding 5: rate limits.
-- ----------------------------------------------------------------------------

drop function if exists public.try_consume_rate_limit(uuid, text, integer, integer);

-- Thresholds live here, not in TypeScript, so a direct API caller cannot
-- choose its own. lib/rate-limit.ts only names the surface.
create table private.rate_limit_rules (
  surface        text primary key check (surface ~ '^[a-z0-9_]{1,64}$'),
  max_count      integer not null check (max_count >= 1),
  window_seconds integer not null check (window_seconds >= 1)
);

alter table private.rate_limit_rules enable row level security;
revoke all on table private.rate_limit_rules from public, anon, authenticated;

comment on table private.rate_limit_rules is
  'Per-surface write limits read by public.consume_rate_limit(). Windows are aligned to the epoch, so a caller can spend up to 2x max_count around a boundary.';

insert into private.rate_limit_rules (surface, max_count, window_seconds) values
  ('handle_create',  5,   3600),
  ('profile_update', 30,  3600),
  ('follow',         100, 3600),
  ('block',          50,  3600),
  ('post',           30,  3600),
  ('comment',        60,  3600),
  ('dm',             100, 3600),
  ('join_request',   20,  86400),
  ('images_upload',  10,  3600),
  ('tos_accept',     10,  3600);

-- Charges one write on p_surface to the caller. Returns 0 when allowed, or
-- the number of seconds until the window resets when the caller is over the
-- limit (the over-limit call is still counted).
create or replace function public.consume_rate_limit(p_surface text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := (select auth.uid());
  v_rule         private.rate_limit_rules%rowtype;
  v_now          bigint := floor(extract(epoch from now()))::bigint;
  v_window_start bigint;
  v_count        integer;
begin
  if v_uid is null then
    raise exception 'consume_rate_limit needs a signed-in caller'
      using errcode = '42501';
  end if;

  select * into v_rule from private.rate_limit_rules where surface = p_surface;
  if not found then
    raise exception 'unknown rate-limit surface: %', p_surface
      using errcode = '22023';
  end if;

  v_window_start := v_now - (v_now % v_rule.window_seconds);

  insert into public.rate_limit_counters as c (profile_id, surface, window_start, count)
  values (v_uid, p_surface, to_timestamp(v_window_start), 1)
  on conflict (profile_id, surface, window_start)
    do update set count = c.count + 1
  returning c.count into v_count;

  if v_count <= v_rule.max_count then
    return 0;
  end if;
  return greatest(1, v_window_start + v_rule.window_seconds - v_now)::integer;
end;
$$;

revoke all on function public.consume_rate_limit(text) from public, anon;
grant execute on function public.consume_rate_limit(text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Findings 2, 8: onboarding and ToS acceptance.
-- ----------------------------------------------------------------------------

revoke insert on table public.tos_acceptances from anon, authenticated;
drop policy if exists "tos_acceptances_insert_own" on public.tos_acceptances;

-- Creates the caller's profile and records their ToS acceptance in one
-- transaction. Returns a status instead of raising so that the rate-limit
-- charge for a failed attempt (e.g. a taken handle) is kept. The caller
-- masks p_ip (lib/tos.ts); this function only guards lengths.
--
-- Statuses: ok | already_onboarded | invalid_handle | invalid_display_name |
--           invalid_tos_version | rate_limited | handle_taken | unauthorized
create or replace function public.complete_onboarding(
  p_handle       text,
  p_display_name text,
  p_tos_version  text,
  p_ip           text default null,
  p_user_agent   text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := (select auth.uid());
  v_handle       text := lower(btrim(coalesce(p_handle, '')));
  v_display_name text := btrim(coalesce(p_display_name, ''));
  v_constraint   text;
begin
  if v_uid is null then
    return 'unauthorized';
  end if;
  if exists (select 1 from public.profiles where id = v_uid) then
    return 'already_onboarded';
  end if;
  if v_handle !~ '^[a-z0-9_]{3,30}$' then
    return 'invalid_handle';
  end if;
  if char_length(v_display_name) not between 1 and 50 then
    return 'invalid_display_name';
  end if;
  if coalesce(p_tos_version, '') !~ '^v[0-9]+\.[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return 'invalid_tos_version';
  end if;

  if public.consume_rate_limit('handle_create') > 0 then
    return 'rate_limited';
  end if;

  begin
    insert into public.profiles (id, handle, display_name)
    values (v_uid, v_handle, v_display_name);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'profiles_pkey' then
        return 'already_onboarded';
      end if;
      return 'handle_taken';
  end;

  insert into public.tos_acceptances (profile_id, version, ip, user_agent)
  values (
    v_uid,
    p_tos_version,
    case when char_length(p_ip) <= 64 then p_ip end,
    nullif(left(p_user_agent, 256), '')
  )
  on conflict (profile_id, version) do nothing;

  return 'ok';
end;
$$;

-- Records acceptance of a newer ToS version (the re-acceptance flow).
-- Statuses: ok | already_accepted | invalid_tos_version | rate_limited |
--           unauthorized
create or replace function public.accept_tos(
  p_version    text,
  p_ip         text default null,
  p_user_agent text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return 'unauthorized';
  end if;
  if coalesce(p_version, '') !~ '^v[0-9]+\.[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return 'invalid_tos_version';
  end if;
  if public.consume_rate_limit('tos_accept') > 0 then
    return 'rate_limited';
  end if;

  insert into public.tos_acceptances (profile_id, version, ip, user_agent)
  values (
    v_uid,
    p_version,
    case when char_length(p_ip) <= 64 then p_ip end,
    nullif(left(p_user_agent, 256), '')
  )
  on conflict (profile_id, version) do nothing;

  if found then
    return 'ok';
  end if;
  return 'already_accepted';
end;
$$;

revoke all on function public.complete_onboarding(text, text, text, text, text) from public, anon;
grant execute on function public.complete_onboarding(text, text, text, text, text) to authenticated, service_role;
revoke all on function public.accept_tos(text, text, text) from public, anon;
grant execute on function public.accept_tos(text, text, text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Finding 6: images and storage. lib/images.ts already uploads with the
-- secret key after the sharp re-encode; now it is the only way in.
-- ----------------------------------------------------------------------------

revoke insert on table public.images from anon, authenticated;
drop policy if exists "images_insert_self_pending" on public.images;

alter table public.images
  add constraint images_pending_path_in_uploader_folder
  check (starts_with(pending_path, uploader_id::text || '/')) not valid;
alter table public.images
  validate constraint images_pending_path_in_uploader_folder;

drop policy if exists "storage_pending_insert_self" on storage.objects;

-- Public buckets serve objects by URL without any policy. This policy only
-- added the ability to list and search the whole bucket.
drop policy if exists "storage_approved_select_world" on storage.objects;

update storage.buckets
set file_size_limit    = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id in ('images-pending', 'images-approved');

-- ----------------------------------------------------------------------------
-- Pin search_path on the remaining trigger functions.
-- ----------------------------------------------------------------------------

alter function public.set_updated_at() set search_path = '';
alter function public.blocks_revoke_follows() set search_path = '';
