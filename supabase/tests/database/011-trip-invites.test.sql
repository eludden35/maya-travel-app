-- tripplanner-2o5.1: invite links. Make, read, preview, accept, replace and
-- turn off a link, as anon, the organizer, a member, strangers and people who
-- haven't onboarded yet. Product rules (test plan section 12, 2026-11-03):
-- 1-30 days and 1-50 uses (Q6); only the organizer reads a link (Q8); a block
-- with anyone in the trip stops a join and looks like a dead link (Q9); only
-- the organizer makes or turns off links (Q10); one live link per trip.
begin;
select plan(100);

select tests.create_user('alice');                                                -- organizer
select tests.create_user('bob');                                                  -- member
select tests.create_user('carol');                                                -- joins by link
select tests.create_user('dave');                                                 -- stranger
select tests.create_user('erin',  p_with_profile => false, p_allowlisted => false); -- new, invited
select tests.create_user('frank', p_with_profile => false);                       -- new, allow-listed
select tests.create_user('gina',  p_with_profile => false, p_allowlisted => false); -- new, refused
select tests.create_user('paula', p_with_profile => false);                       -- new, dead link
select tests.create_user('hank');
select tests.create_user('ivan');
select tests.create_user('mallory');                                              -- bob blocked her
select tests.create_user('oscar');                                                -- blocked alice
select tests.create_user('rita');                                                 -- rate limits
select tests.create_trip('alice', 'Porto');
insert into public.trip_members (trip_id, profile_id, role)
values (tests.id('Porto'), tests.id('bob'), 'member');
insert into public.blocks (blocker_id, blocked_id) values
  (tests.id('bob'), tests.id('mallory')),
  (tests.id('oscar'), tests.id('alice'));

-- Tokens by name, readable while acting as anyone. Rolled back with the rest.
create table tests.tokens (name text primary key, token text not null);
grant select on tests.tokens to anon, authenticated;
create function tests.token(p_name text)
returns text
language sql
stable
as $$
  select token from tests.tokens where name = p_name;
$$;
grant execute on function tests.token(text) to anon, authenticated;

-- Saves a trip's live link: its token under p_name, its id in tests.ids.
create function tests.save_live_link(p_name text, p_trip text default 'Porto')
returns void
language sql
as $$
  insert into tests.tokens (name, token)
  select p_name, i.token from public.trip_invites i
  where i.trip_id = tests.id(p_trip) and i.revoked_at is null;
  insert into tests.ids (name, id)
  select p_name, i.id from public.trip_invites i
  where i.trip_id = tests.id(p_trip) and i.revoked_at is null;
$$;

-- ----------------------------------------------------------------------------
-- Who may call and read
-- ----------------------------------------------------------------------------

select is_empty(
  $$ select f
     from unnest(array[
       'public.create_trip_invite(uuid, integer, integer)',
       'public.revoke_trip_invite(uuid)',
       'public.accept_trip_invite(text)',
       'public.can_complete_onboarding(text)',
       'public.complete_onboarding(text, text, text, text, text, text)'
     ]) as f
     where has_function_privilege('anon', f, 'execute') $$,
  'anon cannot make, turn off or accept links, or onboard'
);
select ok(
  has_function_privilege('anon', 'public.get_trip_invite_preview(text)', 'execute'),
  'anon can call the preview, which comes before sign-in'
);
select is_empty(
  $$ select r || ' ' || f
     from unnest(array['anon', 'authenticated']) as r,
          unnest(array[
            'private.is_invite_token(text)',
            'private.new_invite_token()',
            'private.trip_invite_problem(public.trip_invites)',
            'private.blocked_with_trip(uuid, uuid)',
            'private.lock_trip_invite(text)',
            'private.join_trip_by_invite(public.trip_invites, uuid)'
          ]) as f
     where has_function_privilege(r, f, 'execute') $$,
  'clients cannot call the private invite helpers'
);
select ok(
  not has_table_privilege('anon', 'public.trip_invites', 'select, insert, update, delete'),
  'anon has no access to trip_invites'
);
select ok(
  not has_table_privilege('authenticated', 'public.trip_invites', 'insert, update, delete'),
  'clients cannot write trip_invites'
);

-- ----------------------------------------------------------------------------
-- Make a link
-- ----------------------------------------------------------------------------

select tests.authenticate_as('dave');
select is((select status from public.create_trip_invite(tests.id('Porto'), 7, 10)),
  'not_found', 'a stranger cannot make a link, and learns nothing about the trip');

reset role;
select tests.authenticate_as('bob');
select is((select status from public.create_trip_invite(tests.id('Porto'), 7, 10)),
  'forbidden', 'a member cannot make a link');

reset role;
select tests.authenticate_as('alice');
select is((select status from public.create_trip_invite(tests.id('Porto'), 0, 10)),
  'invalid_expiry', 'a link lasts at least a day');
select is((select status from public.create_trip_invite(tests.id('Porto'), 31, 10)),
  'invalid_expiry', 'and at most 30 days');
select is((select status from public.create_trip_invite(tests.id('Porto'), null, 10)),
  'invalid_expiry', 'and must have an expiry');
select is((select status from public.create_trip_invite(tests.id('Porto'), 7, 0)),
  'invalid_max_uses', 'a link admits at least one person');
select is((select status from public.create_trip_invite(tests.id('Porto'), 7, 51)),
  'invalid_max_uses', 'and at most 50');
select is((select status from public.create_trip_invite(tests.id('Porto'), 7, null)),
  'invalid_max_uses', 'and must have a limit');
select is((select status from public.create_trip_invite(tests.id('Porto'), 7, 10)),
  'ok', 'the organizer can make a link');

reset role;
select tests.clear_auth();
select tests.save_live_link('link 1');
select results_eq(
  $$ select token ~ '^[A-Za-z0-9_-]{22}$', expires_at - created_at, max_uses, uses,
            revoked_at is null, created_by
     from public.trip_invites where trip_id = tests.id('Porto') $$,
  $$ values (true, interval '7 days', 10, 0, true, tests.id('alice')) $$,
  'the link has a 22-character token, lasts 7 days, admits 10 and has none used'
);
select is(
  (select coalesce(sum(count), 0)::int from public.rate_limit_counters
   where profile_id = tests.id('alice') and surface = 'trip_invite'),
  1,
  'making a link charges trip_invite once; refused input charges nothing'
);

-- ----------------------------------------------------------------------------
-- Only the organizer reads a link (Q8); nobody writes one directly
-- ----------------------------------------------------------------------------

select tests.authenticate_as('alice');
select is((select count(*)::int from public.trip_invites), 1,
  'the organizer can read their trip''s link');

reset role;
select tests.authenticate_as('bob');
select is_empty($$ select * from public.trip_invites $$, 'a member cannot read it');

reset role;
select tests.authenticate_as('dave');
select is_empty($$ select * from public.trip_invites $$, 'a stranger cannot read it');

reset role;
select tests.authenticate_as_anon();
select throws_ok($$ select * from public.trip_invites $$, '42501', null,
  'anon cannot read trip_invites');

reset role;
select tests.authenticate_as('alice');
select throws_ok(
  $$ insert into public.trip_invites (trip_id, token, created_by, expires_at, max_uses)
     values (tests.id('Porto'), 'AAAAAAAAAAAAAAAAAAAAAA', tests.id('alice'),
             now() + interval '1 day', 5) $$,
  '42501', null,
  'the organizer cannot insert a link of their own choosing'
);
select throws_ok($$ update public.trip_invites set max_uses = 50 $$, '42501', null,
  'or raise a link''s limit directly');
select throws_ok($$ delete from public.trip_invites $$, '42501', null,
  'or delete links directly');

-- ----------------------------------------------------------------------------
-- Preview
-- ----------------------------------------------------------------------------

reset role;
select tests.authenticate_as_anon();
select results_eq(
  $$ select * from public.get_trip_invite_preview(tests.token('link 1')) $$,
  $$ values (null::uuid, 'Porto'::text, null::date, null::date, 'Alice'::text, 2) $$,
  'anyone holding the link sees the trip''s name and dates, the organizer and the member count, and no trip id'
);
select is_empty($$ select * from public.get_trip_invite_preview('AAAAAAAAAAAAAAAAAAAAAA') $$,
  'an unknown token shows nothing');
select is_empty($$ select * from public.get_trip_invite_preview('not a token') $$,
  'a malformed token shows nothing');
select is_empty($$ select * from public.get_trip_invite_preview(null) $$,
  'no token shows nothing');

reset role;
select tests.authenticate_as('bob');
select is((select trip_id from public.get_trip_invite_preview(tests.token('link 1'))),
  tests.id('Porto'), 'someone already in the trip also gets its id');

-- ----------------------------------------------------------------------------
-- Accept
-- ----------------------------------------------------------------------------

reset role;
select tests.authenticate_as_anon();
select throws_ok($$ select * from public.accept_trip_invite(tests.token('link 1')) $$,
  '42501', null, 'anon cannot accept a link');

reset role;
select tests.authenticate_as('erin');
select is((select status from public.accept_trip_invite(tests.token('link 1'))),
  'unauthorized', 'someone who hasn''t onboarded joins through onboarding, not here');

reset role;
select tests.authenticate_as('carol');
select is((select status from public.accept_trip_invite('AAAAAAAAAAAAAAAAAAAAAA')),
  'invalid', 'an unknown token is invalid');
select is((select status from public.accept_trip_invite('not a token')),
  'invalid', 'so is a malformed one');
select results_eq(
  $$ select status, trip_id from public.accept_trip_invite(tests.token('link 1')) $$,
  $$ values ('ok'::text, tests.id('Porto')) $$,
  'a live link lets an onboarded user join'
);

reset role;
select tests.clear_auth();
select results_eq(
  $$ select role::text from public.trip_members
     where trip_id = tests.id('Porto') and profile_id = tests.id('carol') $$,
  $$ values ('member'::text) $$,
  'they join as a member'
);
select results_eq(
  $$ select (select uses from public.trip_invites where id = tests.id('link 1')),
            (select coalesce(sum(count), 0)::int from public.rate_limit_counters
             where profile_id = tests.id('carol') and surface = 'trip_join') $$,
  $$ values (1, 1) $$,
  'the use is counted and the join charges trip_join'
);

select tests.authenticate_as('carol');
select results_eq(
  $$ select status, trip_id from public.accept_trip_invite(tests.token('link 1')) $$,
  $$ values ('already_member'::text, tests.id('Porto')) $$,
  'accepting again finds them already in the trip'
);

reset role;
select tests.clear_auth();
select results_eq(
  $$ select (select uses from public.trip_invites where id = tests.id('link 1')),
            (select coalesce(sum(count), 0)::int from public.rate_limit_counters
             where profile_id = tests.id('carol') and surface = 'trip_join') $$,
  $$ values (1, 1) $$,
  'and counts no second use and charges nothing'
);
select results_eq(
  $$ select (select count(*)::int from public.trip_members
             where profile_id = tests.id('carol')),
            (select organizer_id from public.trips where id = tests.id('Porto')) $$,
  $$ values (1, tests.id('alice')) $$,
  'joining adds one membership and nothing else changes'
);

select tests.authenticate_as('carol');
select is_empty($$ select * from public.trip_invites $$,
  'a member who joined by the link still cannot read it');
select is((select status from public.create_trip_invite(tests.id('Porto'), 7, 10)),
  'forbidden', 'or make links');

reset role;
select tests.authenticate_as('alice');
select is((select status from public.accept_trip_invite(tests.token('link 1'))),
  'already_member', 'the organizer opening their own link is already in the trip');

-- ----------------------------------------------------------------------------
-- A new link replaces the old one
-- ----------------------------------------------------------------------------

select is((select status from public.create_trip_invite(tests.id('Porto'), 1, 5)),
  'ok', 'the organizer can make a new link');

reset role;
select tests.clear_auth();
select tests.save_live_link('link 2');
select results_eq(
  $$ select count(*) filter (where revoked_at is null)::int, count(*)::int
     from public.trip_invites where trip_id = tests.id('Porto') $$,
  $$ values (1, 2) $$,
  'one live link per trip'
);
select ok(
  (select revoked_at is not null from public.trip_invites where id = tests.id('link 1')),
  'the new link turned the old one off'
);
select is(
  (select expires_at - created_at from public.trip_invites where id = tests.id('link 2')),
  interval '1 day',
  'and keeps its own settings'
);

select tests.authenticate_as('dave');
select is((select status from public.accept_trip_invite(tests.token('link 1'))),
  'revoked', 'the replaced link is refused as turned off');

reset role;
select tests.authenticate_as_anon();
select is_empty($$ select * from public.get_trip_invite_preview(tests.token('link 1')) $$,
  'and its preview shows nothing');

-- ----------------------------------------------------------------------------
-- Turn a link off
-- ----------------------------------------------------------------------------

reset role;
select tests.authenticate_as('bob');
select is(public.revoke_trip_invite(tests.id('link 2')),
  'forbidden', 'a member cannot turn a link off');

reset role;
select tests.authenticate_as('dave');
select is(public.revoke_trip_invite(tests.id('link 2')),
  'not_found', 'a stranger gets not found');
select is(public.revoke_trip_invite(gen_random_uuid()),
  'not_found', 'so does an unknown link');

reset role;
select tests.authenticate_as('alice');
select is(public.revoke_trip_invite(tests.id('link 2')),
  'ok', 'the organizer can turn the link off');
select is(public.revoke_trip_invite(tests.id('link 2')),
  'ok', 'turning it off twice is harmless');

reset role;
select tests.authenticate_as('dave');
select is((select status from public.accept_trip_invite(tests.token('link 2'))),
  'revoked', 'a link that was turned off is refused');

reset role;
select tests.authenticate_as_anon();
select is_empty($$ select * from public.get_trip_invite_preview(tests.token('link 2')) $$,
  'and its preview shows nothing');

-- ----------------------------------------------------------------------------
-- Expired and full links
-- ----------------------------------------------------------------------------

reset role;
select tests.authenticate_as('alice');
select is((select status from public.create_trip_invite(tests.id('Porto'), 7, 10)),
  'ok', 'a link to let expire');

reset role;
select tests.clear_auth();
select tests.save_live_link('link 3');
update public.trip_invites
set created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
where id = tests.id('link 3');

select tests.authenticate_as('dave');
select is((select status from public.accept_trip_invite(tests.token('link 3'))),
  'expired', 'an expired link is refused');

reset role;
select tests.authenticate_as_anon();
select is_empty($$ select * from public.get_trip_invite_preview(tests.token('link 3')) $$,
  'and its preview shows nothing');

reset role;
select tests.authenticate_as('alice');
select is((select status from public.create_trip_invite(tests.id('Porto'), 7, 1)),
  'ok', 'a link for one person');

reset role;
select tests.clear_auth();
select tests.save_live_link('link 4');

select tests.authenticate_as('hank');
select is((select status from public.accept_trip_invite(tests.token('link 4'))),
  'ok', 'admits one person');

reset role;
select tests.authenticate_as('ivan');
select is((select status from public.accept_trip_invite(tests.token('link 4'))),
  'full', 'and then it is full');

reset role;
select tests.authenticate_as_anon();
select is_empty($$ select * from public.get_trip_invite_preview(tests.token('link 4')) $$,
  'a full link''s preview shows nothing');

reset role;
select tests.clear_auth();
select results_eq(
  $$ select (select uses from public.trip_invites where id = tests.id('link 4')),
            (select count(*)::int from public.trip_members
             where trip_id = tests.id('Porto') and profile_id = tests.id('ivan')) $$,
  $$ values (1, 0) $$,
  'the next person adds nothing and the count stays at the limit (concurrent joins wait on the link''s row lock)'
);

-- ----------------------------------------------------------------------------
-- Blocks (Q9): a block with anyone in the trip looks like a dead link
-- ----------------------------------------------------------------------------

select tests.authenticate_as('alice');
select is((select status from public.create_trip_invite(tests.id('Porto'), 7, 10)),
  'ok', 'a fresh link');

reset role;
select tests.clear_auth();
select tests.save_live_link('link 5');

select tests.authenticate_as('mallory');
select is_empty($$ select * from public.get_trip_invite_preview(tests.token('link 5')) $$,
  'someone a member has blocked sees nothing');
select is((select status from public.accept_trip_invite(tests.token('link 5'))),
  'invalid', 'and cannot join; the answer is the one an unknown link gets');

reset role;
select tests.authenticate_as('oscar');
select is_empty($$ select * from public.get_trip_invite_preview(tests.token('link 5')) $$,
  'someone who blocked the organizer sees nothing');
select is((select status from public.accept_trip_invite(tests.token('link 5'))),
  'invalid', 'and cannot join');

reset role;
select tests.clear_auth();
select results_eq(
  $$ select (select uses from public.trip_invites where id = tests.id('link 5')),
            (select coalesce(sum(count), 0)::int from public.rate_limit_counters
             where profile_id in (tests.id('mallory'), tests.id('oscar'))
               and surface = 'trip_join') $$,
  $$ values (0, 0) $$,
  'a refused join counts no use and charges nothing'
);

select tests.authenticate_as_anon();
select isnt_empty($$ select * from public.get_trip_invite_preview(tests.token('link 5')) $$,
  'the link still works for everyone else');

-- ----------------------------------------------------------------------------
-- Onboarding: a live link admits an email that isn't allow-listed
-- ----------------------------------------------------------------------------

-- Two more trips, each with a link that is still on: one expired, one full.
reset role;
select tests.clear_auth();
select tests.create_trip('alice', 'Braga');
select tests.create_trip('alice', 'Sintra');

select tests.authenticate_as('alice');
select is((select status from public.create_trip_invite(tests.id('Braga'), 7, 10)),
  'ok', 'a link to let expire while it is still on');
select is((select status from public.create_trip_invite(tests.id('Sintra'), 7, 1)),
  'ok', 'a one-person link to fill while it is still on');

reset role;
select tests.clear_auth();
select tests.save_live_link('Braga link', 'Braga');
select tests.save_live_link('Sintra link', 'Sintra');
update public.trip_invites
set created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
where id = tests.id('Braga link');

select tests.authenticate_as('hank');
select is((select status from public.accept_trip_invite(tests.token('Sintra link'))),
  'ok', 'someone takes the one-person link');

reset role;
select tests.authenticate_as('erin');
select is(public.can_complete_onboarding(), false,
  'without a link, an email that isn''t allow-listed still can''t onboard');
select is(public.can_complete_onboarding(tests.token('link 5')), true,
  'a live link lets them');
select is(public.can_complete_onboarding(tests.token('Braga link')), false,
  'an expired one doesn''t');
select is(public.can_complete_onboarding(tests.token('Sintra link')), false,
  'nor does a full one');
select is(public.can_complete_onboarding(tests.token('link 2')), false,
  'nor one that was turned off');
select is(public.can_complete_onboarding('AAAAAAAAAAAAAAAAAAAAAA'), false,
  'nor an unknown one');
select is(
  public.complete_onboarding('t_erin', 'Erin', 'v1.0-2026-04-19', null, null, tests.token('Braga link')),
  'invite_required',
  'complete_onboarding refuses an expired link'
);
select is(
  public.complete_onboarding('t_erin', 'Erin', 'v1.0-2026-04-19', null, null, tests.token('Sintra link')),
  'invite_required',
  'and a full one'
);
select is(
  public.complete_onboarding('t_erin', 'Erin', 'v1.0-2026-04-19', null, null),
  'invite_required',
  'complete_onboarding refuses them without a link'
);
select is(
  public.complete_onboarding('t_erin', 'Erin', 'v1.0-2026-04-19', null, null, tests.token('link 2')),
  'invite_required',
  'or with a link that was turned off'
);
select is(
  public.complete_onboarding('t_erin', 'Erin', 'v1.0-2026-04-19', null, null, tests.token('link 5')),
  'ok',
  'and lets them in with a live one'
);

reset role;
select tests.clear_auth();
select results_eq(
  $$ select (select count(*)::int from public.profiles where id = tests.id('erin')),
            (select role::text from public.trip_members
             where trip_id = tests.id('Porto') and profile_id = tests.id('erin')),
            (select uses from public.trip_invites where id = tests.id('link 5')) $$,
  $$ values (1, 'member'::text, 1) $$,
  'their profile, their membership and the use land together'
);

select tests.authenticate_as('erin');
select results_eq(
  $$ select status, trip_id from public.accept_trip_invite(tests.token('link 5')) $$,
  $$ values ('already_member'::text, tests.id('Porto')) $$,
  'accepting afterwards, as the app does, finds them in the trip'
);

reset role;
select tests.authenticate_as('gina');
select is(
  public.complete_onboarding('x', 'Gina', 'v1.0-2026-04-19', null, null, tests.token('link 5')),
  'invalid_handle',
  'an onboarding refused for its input'
);

reset role;
select tests.clear_auth();
select results_eq(
  $$ select (select uses from public.trip_invites where id = tests.id('link 5')),
            (select count(*)::int from public.trip_members
             where profile_id = tests.id('gina')) $$,
  $$ values (1, 0) $$,
  'joins nothing and counts no use'
);

select tests.authenticate_as('frank');
select is(
  public.complete_onboarding('t_frank', 'Frank', 'v1.0-2026-04-19', null, null, tests.token('link 5')),
  'ok',
  'an allow-listed person onboarding with a live link'
);

reset role;
select tests.clear_auth();
select is(
  (select role::text from public.trip_members
   where trip_id = tests.id('Porto') and profile_id = tests.id('frank')),
  'member',
  'joins the trip as well'
);

select tests.authenticate_as('paula');
select is(
  public.complete_onboarding('t_paula', 'Paula', 'v1.0-2026-04-19', null, null, tests.token('link 4')),
  'ok',
  'an allow-listed person whose link is dead still onboards'
);

reset role;
select tests.clear_auth();
select results_eq(
  $$ select (select count(*)::int from public.profiles where id = tests.id('paula')),
            (select count(*)::int from public.trip_members
             where profile_id = tests.id('paula')) $$,
  $$ values (1, 0) $$,
  'without joining anything'
);

-- ----------------------------------------------------------------------------
-- Rate limits
-- ----------------------------------------------------------------------------

update private.rate_limit_rules set max_count = 1
where surface in ('trip_invite', 'trip_join');

select tests.authenticate_as('rita');
select is((select status from public.accept_trip_invite(tests.token('link 5'))),
  'ok', 'the first join in the window goes through');

reset role;
select tests.clear_auth();
select tests.create_trip('rita', 'Faro');

select tests.authenticate_as('rita');
select is((select status from public.create_trip_invite(tests.id('Faro'), 7, 10)),
  'ok', 'the first link change in the window goes through');
select is((select status from public.create_trip_invite(tests.id('Faro'), 7, 10)),
  'rate_limited', 'making links past the limit is refused');

reset role;
select tests.clear_auth();
insert into tests.tokens (name, token)
select 'Faro link', i.token from public.trip_invites i where i.trip_id = tests.id('Faro');

select tests.authenticate_as('ivan');
select is((select status from public.accept_trip_invite(tests.token('Faro link'))),
  'ok', 'another person''s first join');
select is((select status from public.accept_trip_invite(tests.token('link 5'))),
  'rate_limited', 'joining past the limit is refused');

reset role;
select tests.clear_auth();
select is(
  (select count(*)::int from public.trip_members
   where trip_id = tests.id('Porto') and profile_id = tests.id('ivan')),
  0,
  'and adds nobody'
);

-- ----------------------------------------------------------------------------
-- Deleting a trip takes its links with it
-- ----------------------------------------------------------------------------

select tests.authenticate_as('alice');
select is(public.delete_trip(tests.id('Porto')), 'ok', 'a trip with links can be deleted');

reset role;
select tests.clear_auth();
select is(
  (select count(*)::int from public.trip_invites where trip_id = tests.id('Porto')),
  0,
  'and its links go with it'
);

select tests.authenticate_as_anon();
select is_empty($$ select * from public.get_trip_invite_preview(tests.token('link 5')) $$,
  'so even a live link shows nothing');

select * from finish();
rollback;
