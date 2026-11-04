-- =============================================================================
-- trip_invites: invite links. Bead tripplanner-2o5.1 (UAT-1 epic
-- tripplanner-2o5). Product decisions are in docs/uat/uat-1-test-plan.md
-- section 12 (founder, 2026-11-03):
--
--   Q6  A link lasts 7 days and admits 10 people unless the organizer picks
--       otherwise: 1 to 30 days, 1 to 50 people. Nothing is unlimited while
--       Jettison is invite-only, because each use also lets one new account
--       past private.onboarding_allowlist.
--   Q8  The token is stored as is and only the trip's organizer can read it,
--       so they can share the same link again. Turning a link off, or making
--       a new one, kills a leaked link.
--   Q9  Someone who has blocked, or been blocked by, anyone already in the
--       trip can't join. They get the answer a dead link gets, so the block
--       isn't revealed (ADR 0002). People already in a trip together stay
--       (Q5).
--   Q10 Only the organizer makes and turns off links. Members can't read them.
--
-- One live link per trip: create_trip_invite turns the trip's current link
-- off in the same transaction, which is how a link is rotated.
--
--   create_trip_invite       organizer: a new link, replacing the current one.
--   revoke_trip_invite       organizer: turn a link off.
--   accept_trip_invite       an onboarded user holding a live link: join.
--   get_trip_invite_preview  anyone holding the link, signed in or not: the
--                            trip's name and dates, the organizer's display
--                            name and the member count. Nothing for a link
--                            that is unknown, malformed, turned off, expired
--                            or full, or for a blocked caller: those all
--                            look alike on purpose.
--
-- Each RPC is security definer with search_path = '', takes identity only
-- from auth.uid(), and validates before charging consume_rate_limit in the
-- same transaction (the trip_lifecycle pattern). Clients can read the table
-- (organizer only) and never write it.
--
-- Onboarding: while Jettison is invite-only, a live link is the second way
-- past the allow-list. complete_onboarding with a live token creates the
-- profile, joins the trip and counts the use in one transaction, so a link
-- admits at most max_uses new accounts and nobody can onboard on a link
-- without joining its trip. 20261029120100_onboarding_allowlist.sql stays as
-- it was; the two functions are replaced here.
--
-- Money-privacy hard rule (ADR 0002): no monetary table is touched. Joining
-- adds a trip_members row and nothing else, and money tables key on that
-- membership alone.
-- =============================================================================

create table public.trip_invites (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null
                references public.trips(id) on delete cascade,
  token       text not null unique
                constraint trip_invites_token_shape
                  check (token ~ '^[A-Za-z0-9_-]{22}$'),
  created_by  uuid not null
                references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  max_uses    integer not null
                constraint trip_invites_max_uses_range
                  check (max_uses between 1 and 50),
  uses        integer not null default 0
                constraint trip_invites_uses_range
                  check (uses between 0 and max_uses),
  revoked_at  timestamptz,
  constraint trip_invites_expiry_range
    check (expires_at > created_at and expires_at <= created_at + interval '30 days')
);

comment on table public.trip_invites is
  'Invite links (tripplanner-2o5.1). token is a bearer secret: only the trip''s organizer can read it, and every write goes through the invite RPCs. One unrevoked link per trip.';
comment on column public.trip_invites.token is
  '128 random bits as 22 base64url characters; the link is /join/<token>.';
comment on column public.trip_invites.uses is
  'People who joined through this link. accept_trip_invite and complete_onboarding count a use only when they add a membership.';

-- One live link per trip. A link that expired or filled up still counts
-- until it's revoked, and create_trip_invite revokes it.
create unique index trip_invites_one_unrevoked_per_trip
  on public.trip_invites (trip_id) where revoked_at is null;

-- The organizer's panel reads a trip's newest link; the trips cascade uses it
-- too.
create index trip_invites_trip_id_created_at_idx
  on public.trip_invites (trip_id, created_at desc);

alter table public.trip_invites enable row level security;

revoke all on table public.trip_invites from public, anon, authenticated;
grant select on table public.trip_invites to authenticated;

create policy "trip_invites_select_organizer"
  on public.trip_invites
  for select
  to authenticated
  using (private.is_trip_organizer(trip_id));

insert into private.rate_limit_rules (surface, max_count, window_seconds) values
  ('trip_invite', 30, 3600),
  ('trip_join',   20, 3600);

-- ----------------------------------------------------------------------------
-- Helpers. Only the RPCs below call them, as their owner.
-- ----------------------------------------------------------------------------

create or replace function private.is_invite_token(p_token text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_token ~ '^[A-Za-z0-9_-]{22}$', false);
$$;

-- 128 bits from pgcrypto's strong random source, as unpadded base64url.
create or replace function private.new_invite_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select rtrim(translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/', '-_'), '=');
$$;

-- Why a link can't be used right now, or null when it can. A row of nulls
-- (no such link) is 'invalid'.
create or replace function private.trip_invite_problem(p_invite public.trip_invites)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_invite.id is null then 'invalid'
    when p_invite.revoked_at is not null then 'revoked'
    when p_invite.expires_at <= now() then 'expired'
    when p_invite.uses >= p_invite.max_uses then 'full'
  end;
$$;

-- Has p_profile_id blocked, or been blocked by, anyone in p_trip_id? (Q9)
-- The organizer is a member, so their blocks count too.
create or replace function private.blocked_with_trip(
  p_trip_id    uuid,
  p_profile_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.trip_members m
    join public.blocks b
      on (b.blocker_id = m.profile_id and b.blocked_id = p_profile_id)
      or (b.blocker_id = p_profile_id and b.blocked_id = m.profile_id)
    where m.trip_id = p_trip_id
  );
$$;

-- The link p_token names, locked until the transaction ends, or a row of
-- nulls. The trip is locked first (key share): delete_trip locks the trip
-- before its cascade reaches the link, so taking the link first could
-- deadlock with it. The link lock means two people can't both take its last
-- use.
create or replace function private.lock_trip_invite(p_token text)
returns public.trip_invites
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_trip_id uuid;
  v_invite  public.trip_invites;
begin
  if not private.is_invite_token(p_token) then
    return v_invite;
  end if;

  select i.trip_id into v_trip_id
  from public.trip_invites i
  where i.token = p_token;
  if not found then
    return v_invite;
  end if;

  perform 1 from public.trips t where t.id = v_trip_id for key share;

  select * into v_invite
  from public.trip_invites i
  where i.token = p_token
  for update;
  return v_invite;
end;
$$;

-- Adds p_profile_id to the link's trip as a member and counts the use.
-- Returns false, counting nothing, when they were already in the trip.
-- Callers lock the link first (private.lock_trip_invite) and check it's live.
create or replace function private.join_trip_by_invite(
  p_invite     public.trip_invites,
  p_profile_id uuid
)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
begin
  insert into public.trip_members (trip_id, profile_id, role)
  values (p_invite.trip_id, p_profile_id, 'member')
  on conflict on constraint trip_members_pkey do nothing;
  if not found then
    return false;
  end if;

  update public.trip_invites i
  set uses = i.uses + 1
  where i.id = p_invite.id;
  return true;
end;
$$;

revoke all on function private.is_invite_token(text) from public;
revoke all on function private.new_invite_token() from public;
revoke all on function private.trip_invite_problem(public.trip_invites) from public;
revoke all on function private.blocked_with_trip(uuid, uuid) from public;
revoke all on function private.lock_trip_invite(text) from public;
revoke all on function private.join_trip_by_invite(public.trip_invites, uuid) from public;

-- ----------------------------------------------------------------------------
-- RPCs. Each answers with a status instead of raising, so a rate-limit charge
-- is kept even when the write is refused afterwards. A caller who can't see
-- the trip gets 'not_found', the same as for a trip that doesn't exist.
-- ----------------------------------------------------------------------------

-- A new link for the trip, replacing its current one.
-- Statuses: ok | not_found | forbidden | invalid_expiry | invalid_max_uses |
--           rate_limited | unauthorized
create or replace function public.create_trip_invite(
  p_trip_id         uuid,
  p_expires_in_days integer,
  p_max_uses        integer
)
returns table (status text, invite_id uuid, token text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_invite public.trip_invites;
begin
  if v_uid is null then
    return query select 'unauthorized'::text, null::uuid, null::text;
    return;
  end if;
  if not private.is_trip_member(p_trip_id) then
    return query select 'not_found'::text, null::uuid, null::text;
    return;
  end if;
  if not private.is_trip_organizer(p_trip_id) then
    return query select 'forbidden'::text, null::uuid, null::text;
    return;
  end if;
  if p_expires_in_days is null or p_expires_in_days not between 1 and 30 then
    return query select 'invalid_expiry'::text, null::uuid, null::text;
    return;
  end if;
  if p_max_uses is null or p_max_uses not between 1 and 50 then
    return query select 'invalid_max_uses'::text, null::uuid, null::text;
    return;
  end if;

  if public.consume_rate_limit('trip_invite') > 0 then
    return query select 'rate_limited'::text, null::uuid, null::text;
    return;
  end if;

  -- Serializes link changes for one trip, so two at once can't both leave a
  -- live link. No key update: joins (key share) carry on meanwhile.
  perform 1 from public.trips t where t.id = p_trip_id for no key update;

  update public.trip_invites i
  set revoked_at = now()
  where i.trip_id = p_trip_id
    and i.revoked_at is null;

  insert into public.trip_invites (trip_id, token, created_by, expires_at, max_uses)
  values (
    p_trip_id,
    private.new_invite_token(),
    v_uid,
    now() + make_interval(days => p_expires_in_days),
    p_max_uses
  )
  returning * into v_invite;

  return query select 'ok'::text, v_invite.id, v_invite.token;
end;
$$;

-- Turns a link off. Turning off a link that is already off is 'ok'.
-- Statuses: ok | not_found | forbidden | rate_limited | unauthorized
create or replace function public.revoke_trip_invite(p_invite_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_trip_id uuid;
begin
  if v_uid is null then
    return 'unauthorized';
  end if;

  select i.trip_id into v_trip_id
  from public.trip_invites i
  where i.id = p_invite_id;
  if not found or not private.is_trip_member(v_trip_id) then
    return 'not_found';
  end if;
  if not private.is_trip_organizer(v_trip_id) then
    return 'forbidden';
  end if;

  if public.consume_rate_limit('trip_invite') > 0 then
    return 'rate_limited';
  end if;

  update public.trip_invites i
  set revoked_at = now()
  where i.id = p_invite_id
    and i.revoked_at is null;
  return 'ok';
end;
$$;

-- Joins the link's trip. Someone already in it gets 'already_member' and the
-- trip id, whatever state the link is in, and nothing is counted. A
-- malformed or unknown token and a block (Q9) are all 'invalid', so a block
-- looks like a link that never existed. Dead links name the reason: the
-- caller is signed in and already saw the preview.
-- Statuses: ok | already_member | invalid | expired | revoked | full |
--           rate_limited | unauthorized
create or replace function public.accept_trip_invite(p_token text)
returns table (status text, trip_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_invite  public.trip_invites;
  v_problem text;
begin
  if v_uid is null
     or not exists (select 1 from public.profiles p where p.id = v_uid) then
    return query select 'unauthorized'::text, null::uuid;
    return;
  end if;

  v_invite := private.lock_trip_invite(p_token);
  if v_invite.id is null then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  if exists (
    select 1
    from public.trip_members m
    where m.trip_id = v_invite.trip_id
      and m.profile_id = v_uid
  ) then
    return query select 'already_member'::text, v_invite.trip_id;
    return;
  end if;
  if private.blocked_with_trip(v_invite.trip_id, v_uid) then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;
  v_problem := private.trip_invite_problem(v_invite);
  if v_problem is not null then
    return query select v_problem, null::uuid;
    return;
  end if;

  if public.consume_rate_limit('trip_join') > 0 then
    return query select 'rate_limited'::text, null::uuid;
    return;
  end if;

  perform private.join_trip_by_invite(v_invite, v_uid);
  return query select 'ok'::text, v_invite.trip_id;
end;
$$;

-- What a link invites to, for anyone holding it. One row, or none for every
-- dead, unknown or malformed link and for a blocked caller (Q9). Someone
-- already in the trip also gets trip_id, whatever state the link is in, so
-- the app can send them straight there. Reads profiles as the owner: the
-- organizer's display name shows even when their profile is hidden, because
-- they chose to share the link. Never anything else: no members, posts or
-- amounts.
create or replace function public.get_trip_invite_preview(p_token text)
returns table (
  trip_id                uuid,
  trip_name              text,
  start_date             date,
  end_date               date,
  organizer_display_name text,
  member_count           integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case when private.is_trip_member(t.id) then t.id end,
    t.name,
    t.start_date,
    t.end_date,
    o.display_name,
    (select count(*)::integer from public.trip_members m where m.trip_id = t.id)
  from public.trip_invites i
  join public.trips t on t.id = i.trip_id
  join public.profiles o on o.id = t.organizer_id
  where private.is_invite_token(p_token)
    and i.token = p_token
    and (
      private.is_trip_member(t.id)
      or (
        private.trip_invite_problem(i) is null
        and not private.blocked_with_trip(t.id, (select auth.uid()))
      )
    );
$$;

revoke all on function public.create_trip_invite(uuid, integer, integer) from public, anon;
revoke all on function public.revoke_trip_invite(uuid) from public, anon;
revoke all on function public.accept_trip_invite(text) from public, anon;
revoke all on function public.get_trip_invite_preview(text) from public;
grant execute on function public.create_trip_invite(uuid, integer, integer) to authenticated, service_role;
grant execute on function public.revoke_trip_invite(uuid) to authenticated, service_role;
grant execute on function public.accept_trip_invite(text) to authenticated, service_role;
-- The preview comes before sign-in.
grant execute on function public.get_trip_invite_preview(text) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Onboarding: allow-listed email or live invite. Both functions gain an
-- optional p_invite_token. Each is dropped and recreated rather than
-- overloaded, because an overload would make every existing call ambiguous.
-- Calls without the new argument resolve as before.
-- ----------------------------------------------------------------------------

drop function public.can_complete_onboarding();
drop function public.complete_onboarding(text, text, text, text, text);

-- Lets the onboarding page show the invite-only screen before the form.
-- Answers only about the caller's own email and the link they hold.
create function public.can_complete_onboarding(p_invite_token text default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and (
       private.email_is_allowlisted(coalesce((select auth.jwt()) ->> 'email', ''))
       or exists (
         select 1
         from public.trip_invites i
         where private.is_invite_token(p_invite_token)
           and i.token = p_invite_token
           and private.trip_invite_problem(i) is null
       )
     );
$$;

-- Same as 20261029120100_onboarding_allowlist.sql, plus the invite. A live
-- p_invite_token admits an email that isn't allow-listed, and whenever the
-- token is live the profile, the ToS acceptance, the trip membership and the
-- link's use land together.
-- Statuses: ok | already_onboarded | invite_required | invalid_handle |
--           invalid_display_name | invalid_tos_version | rate_limited |
--           handle_taken | unauthorized
create function public.complete_onboarding(
  p_handle       text,
  p_display_name text,
  p_tos_version  text,
  p_ip           text default null,
  p_user_agent   text default null,
  p_invite_token text default null
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
  v_invite       public.trip_invites;
begin
  if v_uid is null then
    return 'unauthorized';
  end if;
  if exists (select 1 from public.profiles where id = v_uid) then
    return 'already_onboarded';
  end if;

  v_invite := private.lock_trip_invite(p_invite_token);
  if private.trip_invite_problem(v_invite) is not null then
    v_invite := null;
  end if;
  if v_invite.id is null
     and not private.email_is_allowlisted(coalesce((select auth.jwt()) ->> 'email', '')) then
    return 'invite_required';
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

  -- A brand-new profile has no blocks yet, so Q9 has nothing to check.
  if v_invite.id is not null then
    perform private.join_trip_by_invite(v_invite, v_uid);
  end if;

  return 'ok';
end;
$$;

revoke all on function public.can_complete_onboarding(text) from public, anon;
grant execute on function public.can_complete_onboarding(text) to authenticated, service_role;
revoke all on function public.complete_onboarding(text, text, text, text, text, text) from public, anon;
grant execute on function public.complete_onboarding(text, text, text, text, text, text) to authenticated, service_role;
