-- tripplanner-x6a: only links made by allow-listed accounts let new accounts
-- in (test plan section 12 Q11, founder, 2026-11-05: "Allow-listed links
-- only"). Someone who got in through a link can still invite people who
-- already have an account, and allow-listed newcomers, but not new accounts
-- the founder never listed. Checked when the link is used, so allow-list
-- edits apply at once.

begin;
select plan(31);

select tests.create_user('ally');                                                   -- allow-listed organizer
select tests.create_user('lenny', p_allowlisted => false);                          -- got in through a link
select tests.create_user('nora',  p_with_profile => false, p_allowlisted => false); -- newcomer, not listed
select tests.create_user('alma',  p_with_profile => false);                         -- newcomer, listed
select tests.create_user('pete',  p_allowlisted => false);                          -- already has a profile
select tests.create_user('nick',  p_with_profile => false, p_allowlisted => false); -- newcomer, other domain
select tests.create_user('nell',  p_with_profile => false, p_allowlisted => false); -- newcomer, other domain

-- Outside example.test, so an '@example.test' entry lets the organizers'
-- links in without listing these two newcomers themselves.
update auth.users set email = tests.ids.name || '@elsewhere.test'
from tests.ids where tests.ids.id = auth.users.id and tests.ids.name in ('nick', 'nell');
update tests.ids set email = tests.ids.name || '@elsewhere.test' where tests.ids.name in ('nick', 'nell');

select tests.create_trip('ally', 'Lisbon');
select tests.create_trip('lenny', 'Faro');
insert into public.trip_invites (trip_id, token, created_by, expires_at, max_uses) values
  (tests.id('Lisbon'), 'LisbonLinkFromAlly0001', tests.id('ally'),  now() + interval '7 days', 10),
  (tests.id('Faro'),   'FaroLinkFromLenny00001', tests.id('lenny'), now() + interval '7 days', 10);

-- ----------------------------------------------------------------------------
-- Who may ask whether their links let new accounts in
-- ----------------------------------------------------------------------------

select is_empty(
  $$ select f
     from unnest(array[
       'public.can_invite_new_accounts()',
       'public.can_complete_onboarding(text)',
       'public.complete_onboarding(text, text, text, text, text, text)'
     ]) as f
     where has_function_privilege('anon', f, 'execute') $$,
  'anon cannot call can_invite_new_accounts or the onboarding functions'
);
select ok(
  has_function_privilege('authenticated', 'public.can_invite_new_accounts()', 'execute'),
  'signed-in users can call can_invite_new_accounts'
);
select is_empty(
  $$ select r
     from unnest(array['anon', 'authenticated']) as r
     where has_function_privilege(r, 'private.account_is_allowlisted(uuid)', 'execute') $$,
  'no client can call the private allow-list check'
);
select is(
  (select pronargs::int from pg_proc
   where oid = 'public.can_invite_new_accounts()'::regprocedure),
  0,
  'can_invite_new_accounts takes no argument, so it can only answer about the caller'
);

select tests.authenticate_as_anon();
select throws_ok($$ select public.can_invite_new_accounts() $$,
  '42501', null, 'anon is refused');

reset role;
select tests.authenticate_as('ally');
select is(public.can_invite_new_accounts(), true,
  'an allow-listed organizer is told their links let new accounts in');

reset role;
select tests.authenticate_as('lenny');
select is(public.can_invite_new_accounts(), false,
  'an organizer who got in through a link is told theirs don''t');

reset role;
select tests.clear_auth();
select set_config('role', 'authenticated', true);
select is(public.can_invite_new_accounts(), false, 'a caller with no user id gets false');

-- ----------------------------------------------------------------------------
-- A newcomer who isn't listed: a link from someone who got in through a link
-- refuses them and writes nothing; a link from an allow-listed organizer
-- lets them in
-- ----------------------------------------------------------------------------

reset role;
select tests.authenticate_as('nora');
select is(public.can_complete_onboarding('FaroLinkFromLenny00001'), false,
  'a live link from an organizer who isn''t listed can''t let a new account in');
select is(
  public.complete_onboarding('t_nora', 'Nora', 'v1.0-2026-04-19', null, null, 'FaroLinkFromLenny00001'),
  'invite_required',
  'so onboarding with it is refused'
);

reset role;
select tests.clear_auth();
select results_eq(
  $$ select (select count(*)::int from public.profiles where id = tests.id('nora')),
            (select count(*)::int from public.tos_acceptances where profile_id = tests.id('nora')),
            (select count(*)::int from public.trip_members where profile_id = tests.id('nora')),
            (select count(*)::int from public.trip_members where trip_id = tests.id('Faro')),
            (select uses from public.trip_invites where token = 'FaroLinkFromLenny00001'),
            (select coalesce(sum(count), 0)::int from public.rate_limit_counters
             where profile_id = tests.id('nora')) $$,
  $$ values (0, 0, 0, 1, 0, 0) $$,
  'the refusal writes nothing: no profile, ToS row, membership or use, and no charge'
);

select tests.authenticate_as('nora');
select is(public.can_complete_onboarding('LisbonLinkFromAlly0001'), true,
  'the same newcomer holding a live link from an allow-listed organizer may onboard');
select is(
  public.complete_onboarding('t_nora', 'Nora', 'v1.0-2026-04-19', null, null, 'LisbonLinkFromAlly0001'),
  'ok',
  'and onboarding with it works'
);

reset role;
select tests.clear_auth();
select results_eq(
  $$ select (select role::text from public.trip_members
             where trip_id = tests.id('Lisbon') and profile_id = tests.id('nora')),
            (select uses from public.trip_invites where token = 'LisbonLinkFromAlly0001') $$,
  $$ values ('member'::text, 1) $$,
  'they join the trip as a member and the link counts one use'
);

-- ----------------------------------------------------------------------------
-- A link from someone who got in through a link still works for an
-- allow-listed newcomer and for anyone who already has a profile
-- ----------------------------------------------------------------------------

select tests.authenticate_as('alma');
select is(public.can_complete_onboarding('FaroLinkFromLenny00001'), true,
  'an allow-listed newcomer may onboard holding that link');
select is(
  public.complete_onboarding('t_alma', 'Alma', 'v1.0-2026-04-19', null, null, 'FaroLinkFromLenny00001'),
  'ok',
  'and onboarding with it works'
);

reset role;
select tests.clear_auth();
select results_eq(
  $$ select (select role::text from public.trip_members
             where trip_id = tests.id('Faro') and profile_id = tests.id('alma')),
            (select uses from public.trip_invites where token = 'FaroLinkFromLenny00001') $$,
  $$ values ('member'::text, 1) $$,
  'the link joins its trip for them, whoever made it'
);

select tests.authenticate_as('pete');
select results_eq(
  $$ select status, trip_id from public.accept_trip_invite('FaroLinkFromLenny00001') $$,
  $$ values ('ok'::text, tests.id('Faro')) $$,
  'someone who already has a profile joins with it'
);

reset role;
select tests.clear_auth();
select results_eq(
  $$ select (select role::text from public.trip_members
             where trip_id = tests.id('Faro') and profile_id = tests.id('pete')),
            (select uses from public.trip_invites where token = 'FaroLinkFromLenny00001') $$,
  $$ values ('member'::text, 2) $$,
  'as a member, counting a second use'
);

-- ----------------------------------------------------------------------------
-- Allow-list edits apply to existing links at once
-- ----------------------------------------------------------------------------

delete from private.onboarding_allowlist where entry = 'ally@example.test';

select tests.authenticate_as('ally');
select is(public.can_invite_new_accounts(), false,
  'with the organizer''s entry removed, they''re told their links no longer let new accounts in');

reset role;
select tests.authenticate_as('nick');
select is(public.can_complete_onboarding('LisbonLinkFromAlly0001'), false,
  'and their live link stops letting new accounts in');
select is(
  public.complete_onboarding('t_nick', 'Nick', 'v1.0-2026-04-19', null, null, 'LisbonLinkFromAlly0001'),
  'invite_required',
  'so onboarding with it is refused'
);

reset role;
select tests.clear_auth();
select results_eq(
  $$ select (select count(*)::int from public.profiles where id = tests.id('nick')),
            (select uses from public.trip_invites where token = 'LisbonLinkFromAlly0001') $$,
  $$ values (0, 1) $$,
  'and nothing is written'
);

insert into private.onboarding_allowlist (entry) values ('@example.test');

select tests.authenticate_as('ally');
select is(public.can_invite_new_accounts(), true,
  'an @domain entry covering the organizer counts');

reset role;
select tests.authenticate_as('nick');
select is(public.can_complete_onboarding('LisbonLinkFromAlly0001'), true,
  'so their link lets new accounts in again');
select is(
  public.complete_onboarding('t_nick', 'Nick', 'v1.0-2026-04-19', null, null, 'LisbonLinkFromAlly0001'),
  'ok',
  'and onboarding with it works'
);

reset role;
select tests.clear_auth();
select results_eq(
  $$ select (select role::text from public.trip_members
             where trip_id = tests.id('Lisbon') and profile_id = tests.id('nick')),
            (select uses from public.trip_invites where token = 'LisbonLinkFromAlly0001') $$,
  $$ values ('member'::text, 2) $$,
  'the newcomer joins the trip and the link counts the use'
);

delete from private.onboarding_allowlist where entry = '@example.test';
insert into private.onboarding_allowlist (entry) values ('*');

select tests.authenticate_as('ally');
select is(public.can_invite_new_accounts(), true,
  '* counts for the organizer too');

reset role;
select tests.authenticate_as('lenny');
select is(public.can_invite_new_accounts(), true,
  'and for one who got in through a link');

reset role;
select tests.authenticate_as('nell');
select is(
  public.complete_onboarding('t_nell', 'Nell', 'v1.0-2026-04-19', null, null, 'LisbonLinkFromAlly0001'),
  'ok',
  'with * a newcomer onboards on the link'
);

reset role;
select tests.clear_auth();
select results_eq(
  $$ select (select role::text from public.trip_members
             where trip_id = tests.id('Lisbon') and profile_id = tests.id('nell')),
            (select uses from public.trip_invites where token = 'LisbonLinkFromAlly0001') $$,
  $$ values ('member'::text, 3) $$,
  'and joins its trip'
);

select * from finish();
rollback;
