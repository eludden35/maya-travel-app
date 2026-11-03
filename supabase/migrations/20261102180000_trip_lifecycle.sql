-- =============================================================================
-- trip_lifecycle: create, edit, delete and leave a trip, and remove a member.
-- Bead tripplanner-718 (UAT-1 epic tripplanner-2o5). Product decisions are in
-- docs/uat/uat-1-test-plan.md section 12 (founder, 2026-11-02).
--
-- Writes move to RPCs. Each is security definer with search_path = '', takes
-- identity only from auth.uid(), validates, and only then charges
-- consume_rate_limit in the same transaction (the complete_onboarding
-- pattern). A direct API call can no longer skip the limit, and no client can
-- write a column the UI doesn't offer (visibility, organizer_id, currency).
-- Clients lose INSERT, UPDATE and DELETE on trips and trip_members, and the
-- write policies those privileges used are dropped.
--
--   create_trip         any onboarded user. Always a private trip: the UAT-1
--                       UI offers private only; the trip_visibility enum stays.
--   update_trip         organizer only: name, description and dates.
--   delete_trip         organizer only, and only when every member could leave.
--   leave_trip          any member except the organizer, who stays until the
--                       trip is deleted. Handing the role over is post-UAT.
--   remove_trip_member  organizer only, never the organizer's own row.
--   get_trip_members    members only. Shows names across a block: inside a
--                       shared trip both people keep seeing each other, so the
--                       ledger reads correctly; outside it the block applies.
--
-- Read paths don't change: trips_select_visible, get_trip(id) and
-- trip_members_select_co_members.
--
-- Seams for later beads:
--   - tripplanner-2o5.3 redefines private.trip_departure_blocker() to return
--     'unsettled_balance' for a nonzero balance. leave_trip and
--     remove_trip_member ask it for the departing member, and delete_trip asks
--     it for every member, so the rule lives in one place. Leave and remove
--     lock the membership row first and delete_trip locks the trip row, so an
--     expense or settlement RPC that locks the same rows serializes with them.
--   - tripplanner-2o5.2: trips.currency below is the trip's one currency.
--   - tripplanner-2o5.1: accept_trip_invite inserts into trip_members as a
--     security definer RPC, which the revokes below don't affect.
--
-- Money-privacy hard rule (ADR 0002): no monetary table is touched.
-- trips.currency names the unit amounts will be kept in; it is not an amount.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- trips.currency: one per trip, picked at creation, never changed. Two-decimal
-- currencies only, because amounts are integer minor units and the money UI
-- shows two decimals (test plan S4-N4). Supporting another currency means
-- redefining private.is_supported_currency() in a new migration; a
-- zero-decimal one such as JPY needs lib/money support first. Keep
-- TRIP_CURRENCIES in lib/trip-fields.ts in step.
-- ----------------------------------------------------------------------------

create or replace function private.is_supported_currency(p_currency text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_currency in ('USD', 'CAD', 'MXN', 'EUR', 'GBP', 'AUD'), false);
$$;

revoke all on function private.is_supported_currency(text) from public;
-- The check constraint runs as whoever writes the row: the RPCs below (as
-- their owner), migrations, and admin scripts using the secret key.
grant execute on function private.is_supported_currency(text) to service_role;

alter table public.trips
  add column currency text not null default 'USD'
    constraint trips_currency_supported check (private.is_supported_currency(currency));

comment on column public.trips.currency is
  'ISO 4217 code, one per trip, set by create_trip and never changed (tripplanner-718). Amounts in this trip are integer minor units of it.';

-- ----------------------------------------------------------------------------
-- Writes are RPC-only.
-- ----------------------------------------------------------------------------

revoke insert, update, delete on table public.trips from anon, authenticated;
revoke insert, update, delete on table public.trip_members from anon, authenticated;

drop policy if exists "trips_insert_organizer_self" on public.trips;
drop policy if exists "trips_update_organizer" on public.trips;
drop policy if exists "trips_delete_organizer" on public.trips;
drop policy if exists "trip_members_delete_self_or_by_organizer" on public.trip_members;

insert into private.rate_limit_rules (surface, max_count, window_seconds) values
  ('trip_create', 10, 3600),
  ('trip_write',  60, 3600);

-- ----------------------------------------------------------------------------
-- Helpers. Only the RPCs below call them, as their owner.
-- ----------------------------------------------------------------------------

-- Why a trip's details can't be saved, or null. Mirrors the trips check
-- constraints so the RPCs answer with a status instead of raising, and adds
-- two rules the constraints lack: the name is one line, and dates stay in a
-- range every client can display.
create or replace function private.trip_details_problem(
  p_name        text,
  p_description text,
  p_start_date  date,
  p_end_date    date
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name is null
      or char_length(p_name) not between 1 and 120
      or p_name ~ '[[:cntrl:]]'
      then 'invalid_name'
    when char_length(p_description) > 2000
      then 'invalid_description'
    when p_start_date not between date '1900-01-01' and date '2999-12-31'
      or p_end_date not between date '1900-01-01' and date '2999-12-31'
      or p_end_date < p_start_date
      then 'invalid_dates'
  end;
$$;

-- Why p_profile_id can't leave, or be removed from, p_trip_id right now, or
-- null when they can. The one place for that rule: leave_trip and
-- remove_trip_member ask it for the departing member, and delete_trip asks it
-- for every member. Nothing blocks a departure until tripplanner-2o5.3
-- redefines this to return 'unsettled_balance' for a nonzero balance.
create or replace function private.trip_departure_blocker(
  p_trip_id    uuid,
  p_profile_id uuid
)
returns text
language sql
stable
set search_path = ''
as $$
  select null::text;
$$;

revoke all on function private.trip_details_problem(text, text, date, date) from public;
revoke all on function private.trip_departure_blocker(uuid, uuid) from public;

-- ----------------------------------------------------------------------------
-- RPCs. Each returns a status rather than raising, so a rate-limit charge is
-- kept even when the write is refused afterwards. Bad input is refused before
-- the charge. A caller who can't see the trip gets 'not_found', the same as
-- for a trip that doesn't exist.
-- ----------------------------------------------------------------------------

-- Statuses: ok | invalid_name | invalid_description | invalid_dates |
--           invalid_currency | rate_limited | unauthorized
create or replace function public.create_trip(
  p_name        text,
  p_currency    text,
  p_description text default null,
  p_start_date  date default null,
  p_end_date    date default null
)
returns table (status text, trip_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := (select auth.uid());
  v_name        text := btrim(coalesce(p_name, ''), E' \t\r\n');
  v_description text := nullif(btrim(coalesce(p_description, ''), E' \t\r\n'), '');
  v_problem     text;
  v_trip_id     uuid;
begin
  if v_uid is null
     or not exists (select 1 from public.profiles p where p.id = v_uid) then
    return query select 'unauthorized'::text, null::uuid;
    return;
  end if;

  v_problem := private.trip_details_problem(v_name, v_description, p_start_date, p_end_date);
  if v_problem is not null then
    return query select v_problem, null::uuid;
    return;
  end if;
  if not private.is_supported_currency(p_currency) then
    return query select 'invalid_currency'::text, null::uuid;
    return;
  end if;

  if public.consume_rate_limit('trip_create') > 0 then
    return query select 'rate_limited'::text, null::uuid;
    return;
  end if;

  -- The organizer's trip_members row comes from the
  -- trips_add_organizer_membership trigger.
  insert into public.trips (organizer_id, name, description, start_date, end_date, currency, visibility)
  values (v_uid, v_name, v_description, p_start_date, p_end_date, p_currency, 'private')
  returning id into v_trip_id;

  return query select 'ok'::text, v_trip_id;
end;
$$;

-- Replaces the editable details; a null description or date clears it.
-- Statuses: ok | not_found | forbidden | invalid_name | invalid_description |
--           invalid_dates | rate_limited | unauthorized
create or replace function public.update_trip(
  p_trip_id     uuid,
  p_name        text,
  p_description text default null,
  p_start_date  date default null,
  p_end_date    date default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := (select auth.uid());
  v_name        text := btrim(coalesce(p_name, ''), E' \t\r\n');
  v_description text := nullif(btrim(coalesce(p_description, ''), E' \t\r\n'), '');
  v_problem     text;
begin
  if v_uid is null then
    return 'unauthorized';
  end if;
  if not private.is_trip_member(p_trip_id) then
    return 'not_found';
  end if;
  if not private.is_trip_organizer(p_trip_id) then
    return 'forbidden';
  end if;

  v_problem := private.trip_details_problem(v_name, v_description, p_start_date, p_end_date);
  if v_problem is not null then
    return v_problem;
  end if;

  if public.consume_rate_limit('trip_write') > 0 then
    return 'rate_limited';
  end if;

  update public.trips
  set name        = v_name,
      description = v_description,
      start_date  = p_start_date,
      end_date    = p_end_date
  where id = p_trip_id;

  return 'ok';
end;
$$;

-- Deletes the trip and, by cascade, everything in it. Allowed only when every
-- member could leave (founder decision, 2026-11-02: settled trips only).
-- Statuses: ok | not_found | forbidden | <a departure blocker> |
--           rate_limited | unauthorized
create or replace function public.delete_trip(p_trip_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_profile_id uuid;
  v_blocker    text;
begin
  if v_uid is null then
    return 'unauthorized';
  end if;
  if not private.is_trip_member(p_trip_id) then
    return 'not_found';
  end if;
  if not private.is_trip_organizer(p_trip_id) then
    return 'forbidden';
  end if;

  perform 1 from public.trips t where t.id = p_trip_id for update;

  for v_profile_id in
    select m.profile_id from public.trip_members m where m.trip_id = p_trip_id
  loop
    v_blocker := private.trip_departure_blocker(p_trip_id, v_profile_id);
    if v_blocker is not null then
      return v_blocker;
    end if;
  end loop;

  if public.consume_rate_limit('trip_write') > 0 then
    return 'rate_limited';
  end if;

  delete from public.trips t where t.id = p_trip_id;
  return 'ok';
end;
$$;

-- Statuses: ok | not_found | organizer_cannot_leave | <a departure blocker> |
--           rate_limited | unauthorized
create or replace function public.leave_trip(p_trip_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_role    public.trip_member_role;
  v_blocker text;
begin
  if v_uid is null then
    return 'unauthorized';
  end if;

  select m.role into v_role
  from public.trip_members m
  where m.trip_id = p_trip_id
    and m.profile_id = v_uid
  for update;
  if not found then
    return 'not_found';
  end if;
  if v_role = 'organizer' then
    return 'organizer_cannot_leave';
  end if;

  v_blocker := private.trip_departure_blocker(p_trip_id, v_uid);
  if v_blocker is not null then
    return v_blocker;
  end if;

  if public.consume_rate_limit('trip_write') > 0 then
    return 'rate_limited';
  end if;

  delete from public.trip_members m
  where m.trip_id = p_trip_id
    and m.profile_id = v_uid;
  return 'ok';
end;
$$;

-- Statuses: ok | not_found | forbidden | not_a_member |
--           cannot_remove_organizer | <a departure blocker> | rate_limited |
--           unauthorized
create or replace function public.remove_trip_member(
  p_trip_id    uuid,
  p_profile_id uuid
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_role    public.trip_member_role;
  v_blocker text;
begin
  if v_uid is null then
    return 'unauthorized';
  end if;
  if not private.is_trip_member(p_trip_id) then
    return 'not_found';
  end if;
  if not private.is_trip_organizer(p_trip_id) then
    return 'forbidden';
  end if;

  select m.role into v_role
  from public.trip_members m
  where m.trip_id = p_trip_id
    and m.profile_id = p_profile_id
  for update;
  if not found then
    return 'not_a_member';
  end if;
  if v_role = 'organizer' then
    return 'cannot_remove_organizer';
  end if;

  v_blocker := private.trip_departure_blocker(p_trip_id, p_profile_id);
  if v_blocker is not null then
    return v_blocker;
  end if;

  if public.consume_rate_limit('trip_write') > 0 then
    return 'rate_limited';
  end if;

  delete from public.trip_members m
  where m.trip_id = p_trip_id
    and m.profile_id = p_profile_id;
  return 'ok';
end;
$$;

-- A trip's members with their names, organizer first, for its members only.
-- Reads profiles as the owner, so a block between two members doesn't hide
-- either name here (founder decision, 2026-11-02); profile reads elsewhere
-- still go through RLS and still hide a blocker from the person they blocked.
create or replace function public.get_trip_members(p_trip_id uuid)
returns table (
  profile_id   uuid,
  handle       text,
  display_name text,
  role         public.trip_member_role,
  joined_at    timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.profile_id, p.handle, p.display_name, m.role, m.joined_at
  from public.trip_members m
  join public.profiles p on p.id = m.profile_id
  where m.trip_id = p_trip_id
    and private.is_trip_member(p_trip_id)
  order by (m.role = 'organizer') desc, m.joined_at, p.handle;
$$;

revoke all on function public.create_trip(text, text, text, date, date) from public, anon;
revoke all on function public.update_trip(uuid, text, text, date, date) from public, anon;
revoke all on function public.delete_trip(uuid) from public, anon;
revoke all on function public.leave_trip(uuid) from public, anon;
revoke all on function public.remove_trip_member(uuid, uuid) from public, anon;
revoke all on function public.get_trip_members(uuid) from public, anon;
grant execute on function public.create_trip(text, text, text, date, date) to authenticated, service_role;
grant execute on function public.update_trip(uuid, text, text, date, date) to authenticated, service_role;
grant execute on function public.delete_trip(uuid) to authenticated, service_role;
grant execute on function public.leave_trip(uuid) to authenticated, service_role;
grant execute on function public.remove_trip_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_trip_members(uuid) to authenticated, service_role;
