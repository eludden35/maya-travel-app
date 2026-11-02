-- Invite-only onboarding for UAT-1: only allow-listed emails get a profile.
begin;
select plan(8);

select tests.create_user('erin', p_with_profile => false, p_allowlisted => false);
select tests.create_user('frank', p_with_profile => false);
select tests.create_user('alice');
delete from private.onboarding_allowlist where entry = 'alice@example.test';

select tests.authenticate_as('erin');
select is(public.can_complete_onboarding(), false, 'an address not on the list cannot onboard');
select is(
  public.complete_onboarding('erin_e', 'Erin', 'v1.0-2026-04-19', null, null),
  'invite_required',
  'complete_onboarding refuses it'
);

reset role;
select tests.clear_auth();
select is(
  (select count(*)::int from public.profiles where id = tests.id('erin')),
  0,
  'no profile was created'
);

select tests.authenticate_as('frank');
select is(public.can_complete_onboarding(), true, 'an allow-listed email can onboard');
select is(
  public.complete_onboarding('frank_f', 'Frank', 'v1.0-2026-04-19', null, null),
  'ok',
  'and complete_onboarding succeeds'
);

reset role;
select tests.authenticate_as('alice');
select is(
  public.complete_onboarding('alice_two', 'Alice', 'v1.0-2026-04-19', null, null),
  'already_onboarded',
  'existing profiles are unaffected by the list'
);

reset role;
select tests.clear_auth();
insert into private.onboarding_allowlist (entry) values ('@example.test');
select tests.authenticate_as('erin');
select is(public.can_complete_onboarding(), true, 'a domain entry admits that whole domain');

reset role;
select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.can_complete_onboarding() $$,
  '42501', null,
  'anon cannot call can_complete_onboarding'
);

select * from finish();
rollback;
