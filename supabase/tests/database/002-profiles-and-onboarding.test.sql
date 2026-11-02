-- Finding 2 (P0): any account could insert its own profile with
-- is_moderator = true, because the guard trigger only ran on UPDATE.
-- Finding 8 (P1): onboarding wrote the profile and the ToS acceptance in two
-- calls, and a direct insert skipped both the ToS gate and the rate limit.
-- Profiles are now created only by complete_onboarding().
begin;
select plan(14);

select tests.create_user('mallory', p_with_profile => false);
select tests.create_user('carol', p_with_profile => false);
select tests.create_user('dave', p_with_profile => false);
select tests.create_user('alice');

select tests.authenticate_as('mallory');
select throws_ok(
  $$ insert into public.profiles (id, handle, display_name, is_moderator)
     values (tests.id('mallory'), 'mallory', 'Mallory', true) $$,
  '42501', null,
  'a client cannot insert a profile directly'
);
reset role;
select tests.clear_auth();
select is(
  (select count(*)::int from public.profiles where id = tests.id('mallory')),
  0,
  'no profile row exists for mallory'
);

select tests.authenticate_as('alice');
select throws_ok(
  $$ update public.profiles set is_moderator = true where id = tests.id('alice') $$,
  '42501', null,
  'a client cannot make itself a moderator'
);
select throws_ok(
  $$ update public.profiles set handle = 'alice_new' where id = tests.id('alice') $$,
  '42501', null,
  'a client cannot change its handle'
);
select lives_ok(
  $$ update public.profiles
     set display_name = 'Alice A', bio = 'hi', is_discoverable = false
     where id = tests.id('alice') $$,
  'display name, bio and discoverability stay editable'
);

reset role;
select tests.authenticate_as('carol');
select is(
  public.complete_onboarding('carol_c', 'Carol', 'v1.0-2026-04-19', '203.0.113.0', 'pgTAP'),
  'ok',
  'complete_onboarding creates the profile'
);
select is(
  public.complete_onboarding('carol_c', 'Carol', 'v1.0-2026-04-19', null, null),
  'already_onboarded',
  'a second call reports already_onboarded'
);
select is(
  (select count(*)::int from public.tos_acceptances
   where profile_id = tests.id('carol') and version = 'v1.0-2026-04-19'),
  1,
  'the ToS acceptance is recorded in the same call'
);
reset role;
select tests.clear_auth();
select is(
  (select is_moderator from public.profiles where id = tests.id('carol')),
  false,
  'a new profile never starts as a moderator'
);

select tests.authenticate_as('dave');
select is(
  public.complete_onboarding('carol_c', 'Dave', 'v1.0-2026-04-19', null, null),
  'handle_taken',
  'a taken handle is reported as a status'
);
select is(
  public.complete_onboarding('No Spaces!', 'Dave', 'v1.0-2026-04-19', null, null),
  'invalid_handle',
  'handles are validated'
);
select is(
  public.complete_onboarding('dave_d', 'Dave', 'not-a-version', null, null),
  'invalid_tos_version',
  'the ToS version is validated'
);
select throws_ok(
  $$ insert into public.tos_acceptances (profile_id, version)
     values (tests.id('dave'), 'v9.9-2099-01-01') $$,
  '42501', null,
  'ToS acceptances cannot be written directly'
);

reset role;
select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.complete_onboarding('anon_user', 'Anon', 'v1.0-2026-04-19', null, null) $$,
  '42501', null,
  'anon cannot call complete_onboarding'
);

select * from finish();
rollback;
