-- tripplanner-718: every trip write goes through an RPC. Create, edit,
-- delete, leave and remove a member, as anon, the organizer, members and a
-- stranger. Product rules (test plan section 12, 2026-11-02): only the
-- organizer edits and deletes; the organizer can't leave; a trip is deleted
-- only when every member could leave; a block between two members doesn't
-- hide names inside their trip.
begin;
select plan(55);

select tests.create_user('alice');                          -- organizer
select tests.create_user('bob');                            -- member
select tests.create_user('carol');                          -- member
select tests.create_user('dave');                           -- stranger
select tests.create_user('erin', p_with_profile => false);  -- not onboarded
select tests.create_user('frank');                          -- rate limits

-- ----------------------------------------------------------------------------
-- Who may call
-- ----------------------------------------------------------------------------

select is_empty(
  $$ select f
     from unnest(array[
       'public.create_trip(text, text, text, date, date)',
       'public.update_trip(uuid, text, text, date, date)',
       'public.delete_trip(uuid)',
       'public.leave_trip(uuid)',
       'public.remove_trip_member(uuid, uuid)',
       'public.get_trip_members(uuid)'
     ]) as f
     where has_function_privilege('anon', f, 'execute') $$,
  'anon cannot call any trip RPC'
);

select tests.authenticate_as('erin');
select is(
  (select status from public.create_trip('Nowhere', 'USD')),
  'unauthorized',
  'a signed-in user without a profile cannot create a trip'
);

-- ----------------------------------------------------------------------------
-- Create
-- ----------------------------------------------------------------------------

reset role;
select tests.authenticate_as('alice');
select is(
  (select status from public.create_trip(
     '  Porto weekend  ', 'EUR', 'Port wine and tiles.', '2026-12-04', '2026-12-07')),
  'ok',
  'an onboarded user can create a trip'
);

reset role;
select tests.clear_auth();
insert into tests.ids (name, id)
select 'Porto weekend', id from public.trips where name = 'Porto weekend';

select results_eq(
  $$ select organizer_id, visibility::text, currency, description, start_date, end_date
     from public.trips where id = tests.id('Porto weekend') $$,
  $$ values (tests.id('alice'), 'private', 'EUR', 'Port wine and tiles.',
             date '2026-12-04', date '2026-12-07') $$,
  'the trip is private, its name is trimmed, and it keeps the currency and dates'
);
select is(
  (select role::text from public.trip_members
   where trip_id = tests.id('Porto weekend') and profile_id = tests.id('alice')),
  'organizer',
  'the creator is the organizer member'
);
select is(
  (select coalesce(sum(count), 0)::int from public.rate_limit_counters
   where profile_id = tests.id('alice') and surface = 'trip_create'),
  1,
  'creating a trip charges trip_create'
);

-- ----------------------------------------------------------------------------
-- Bad input is refused before the rate-limit charge and writes nothing
-- ----------------------------------------------------------------------------

select tests.authenticate_as('alice');
select is((select status from public.create_trip('   ', 'USD')),
  'invalid_name', 'a blank name is refused');
select is((select status from public.create_trip(repeat('x', 121), 'USD')),
  'invalid_name', 'a name over 120 characters is refused');
select is((select status from public.create_trip(E'Two\nlines', 'USD')),
  'invalid_name', 'a name must be one line');
select is((select status from public.create_trip('Faro', 'USD', repeat('x', 2001))),
  'invalid_description', 'a description over 2000 characters is refused');
select is((select status from public.create_trip('Faro', 'USD', null, '2026-12-07', '2026-12-04')),
  'invalid_dates', 'an end date before the start date is refused');
select is((select status from public.create_trip('Faro', 'USD', null, '3000-01-01')),
  'invalid_dates', 'a date after 2999 is refused');
select is((select status from public.create_trip('Faro', 'JPY')),
  'invalid_currency', 'an unsupported currency is refused');
select is((select status from public.create_trip('Faro', null)),
  'invalid_currency', 'a currency is required');

reset role;
select tests.clear_auth();
select is(
  (select count(*)::int from public.trips where organizer_id = tests.id('alice')),
  1,
  'refused trips write nothing'
);
select is(
  (select coalesce(sum(count), 0)::int from public.rate_limit_counters
   where profile_id = tests.id('alice') and surface = 'trip_create'),
  1,
  'refused input does not use up the rate limit'
);

-- ----------------------------------------------------------------------------
-- Direct writes are refused
-- ----------------------------------------------------------------------------

select tests.authenticate_as('alice');
select throws_ok(
  $$ insert into public.trips (organizer_id, name) values (tests.id('alice'), 'Sneaky') $$,
  '42501', null,
  'clients cannot insert trips directly'
);
select throws_ok(
  $$ update public.trips set visibility = 'public' where id = tests.id('Porto weekend') $$,
  '42501', null,
  'clients cannot update trips directly, so visibility cannot be flipped'
);
select throws_ok(
  $$ delete from public.trips where id = tests.id('Porto weekend') $$,
  '42501', null,
  'clients cannot delete trips directly'
);

-- Bob and Carol join. Joining by invite lands in tripplanner-2o5.1, so the
-- test owner adds them here.
reset role;
select tests.clear_auth();
insert into public.trip_members (trip_id, profile_id, role) values
  (tests.id('Porto weekend'), tests.id('bob'), 'member'),
  (tests.id('Porto weekend'), tests.id('carol'), 'member');

-- ----------------------------------------------------------------------------
-- A stranger gets not_found and changes nothing
-- ----------------------------------------------------------------------------

select tests.authenticate_as('dave');
select is(public.update_trip(tests.id('Porto weekend'), 'Mine now'),
  'not_found', 'a stranger cannot edit the trip');
select is(public.delete_trip(tests.id('Porto weekend')),
  'not_found', 'a stranger cannot delete the trip');
select is(public.leave_trip(tests.id('Porto weekend')),
  'not_found', 'a stranger cannot leave a trip they are not in');
select is(public.remove_trip_member(tests.id('Porto weekend'), tests.id('bob')),
  'not_found', 'a stranger cannot remove a member');
select is_empty(
  $$ select * from public.get_trip_members(tests.id('Porto weekend')) $$,
  'a stranger cannot list the members'
);

-- ----------------------------------------------------------------------------
-- A member sees everyone and can leave, but can't edit, delete or remove
-- ----------------------------------------------------------------------------

reset role;
select tests.authenticate_as('bob');
select is(public.update_trip(tests.id('Porto weekend'), 'Bob''s trip'),
  'forbidden', 'a member cannot edit the trip');
select is(public.delete_trip(tests.id('Porto weekend')),
  'forbidden', 'a member cannot delete the trip');
select is(public.remove_trip_member(tests.id('Porto weekend'), tests.id('carol')),
  'forbidden', 'a member cannot remove another member');
select results_eq(
  $$ select handle, role::text from public.get_trip_members(tests.id('Porto weekend')) $$,
  $$ values ('t_alice', 'organizer'), ('t_bob', 'member'), ('t_carol', 'member') $$,
  'members see every member, organizer first'
);
select is(public.leave_trip(tests.id('Porto weekend')),
  'ok', 'a member can leave');
select is_empty(
  $$ select * from public.get_trip(tests.id('Porto weekend')) $$,
  'after leaving, the private trip is gone for them'
);
select is(public.leave_trip(tests.id('Porto weekend')),
  'not_found', 'leaving twice finds nothing to leave');

-- ----------------------------------------------------------------------------
-- The organizer edits and removes, but can't leave
-- ----------------------------------------------------------------------------

reset role;
select tests.authenticate_as('alice');
select is(public.leave_trip(tests.id('Porto weekend')),
  'organizer_cannot_leave', 'the organizer cannot leave their own trip');
select is(public.remove_trip_member(tests.id('Porto weekend'), tests.id('alice')),
  'cannot_remove_organizer', 'the organizer cannot remove themselves');
select is(public.remove_trip_member(tests.id('Porto weekend'), tests.id('dave')),
  'not_a_member', 'removing someone outside the trip finds no one');
select is(public.update_trip(tests.id('Porto weekend'), ''),
  'invalid_name', 'edits are validated too');
select is(
  public.update_trip(tests.id('Porto weekend'), 'Porto long weekend', null, '2026-12-03', '2026-12-07'),
  'ok',
  'the organizer can edit the trip'
);
select results_eq(
  $$ select name, description, start_date, end_date, currency
     from public.trips where id = tests.id('Porto weekend') $$,
  $$ values ('Porto long weekend', null::text, date '2026-12-03', date '2026-12-07', 'EUR') $$,
  'an edit replaces the details, clears the description and keeps the currency'
);
select is(public.remove_trip_member(tests.id('Porto weekend'), tests.id('carol')),
  'ok', 'the organizer can remove a member');

reset role;
select tests.authenticate_as('carol');
select is_empty(
  $$ select * from public.get_trip(tests.id('Porto weekend')) $$,
  'a removed member loses access'
);

-- ----------------------------------------------------------------------------
-- One departure rule for leaving, removing and deleting. tripplanner-2o5.3
-- replaces private.trip_departure_blocker() with the balance check; this
-- stand-in says Bob still owes money.
-- ----------------------------------------------------------------------------

reset role;
select tests.clear_auth();
insert into public.trip_members (trip_id, profile_id, role)
values (tests.id('Porto weekend'), tests.id('bob'), 'member');

create or replace function private.trip_departure_blocker(p_trip_id uuid, p_profile_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case when p_profile_id = tests.id('bob') then 'unsettled_balance' end;
$$;

select tests.authenticate_as('bob');
select is(public.leave_trip(tests.id('Porto weekend')),
  'unsettled_balance', 'leaving asks the departure rule');

reset role;
select tests.authenticate_as('alice');
select is(public.remove_trip_member(tests.id('Porto weekend'), tests.id('bob')),
  'unsettled_balance', 'removing a member asks the departure rule');
select is(public.delete_trip(tests.id('Porto weekend')),
  'unsettled_balance', 'deleting the trip asks the rule for every member');

reset role;
select tests.clear_auth();
select is(
  (select count(*)::int from public.trip_members where trip_id = tests.id('Porto weekend')),
  2,
  'a blocked departure changes nothing'
);

create or replace function private.trip_departure_blocker(p_trip_id uuid, p_profile_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select null::text;
$$;

-- ----------------------------------------------------------------------------
-- Delete
-- ----------------------------------------------------------------------------

select tests.authenticate_as('alice');
select is(public.delete_trip(tests.id('Porto weekend')),
  'ok', 'the organizer can delete a settled trip');

reset role;
select tests.clear_auth();
select is(
  (select count(*)::int from public.trips where id = tests.id('Porto weekend'))
  + (select count(*)::int from public.trip_members where trip_id = tests.id('Porto weekend')),
  0,
  'deleting a trip removes it and its memberships'
);

select tests.authenticate_as('alice');
select is(public.delete_trip(tests.id('Porto weekend')),
  'not_found', 'a deleted trip is not found');

-- ----------------------------------------------------------------------------
-- A block between members doesn't hide names inside their trip
-- ----------------------------------------------------------------------------

reset role;
select tests.clear_auth();
select tests.create_trip('alice', 'Block trip');
insert into public.trip_members (trip_id, profile_id, role) values
  (tests.id('Block trip'), tests.id('bob'), 'member'),
  (tests.id('Block trip'), tests.id('carol'), 'member');
insert into public.blocks (blocker_id, blocked_id)
values (tests.id('carol'), tests.id('bob'));

select tests.authenticate_as('bob');
select is(
  (select display_name from public.get_trip_members(tests.id('Block trip'))
   where profile_id = tests.id('carol')),
  'Carol',
  'inside the trip, the blocked member still sees the blocker''s name'
);
select is(
  (select count(*)::int from public.profiles where id = tests.id('carol')),
  0,
  'outside the trip, the block still hides the blocker''s profile'
);

reset role;
select tests.authenticate_as('carol');
select is(
  (select count(*)::int from public.get_trip_members(tests.id('Block trip'))),
  3,
  'the blocker still sees everyone in the trip'
);

-- ----------------------------------------------------------------------------
-- Rate limits
-- ----------------------------------------------------------------------------

reset role;
select tests.clear_auth();
update private.rate_limit_rules set max_count = 1
where surface in ('trip_create', 'trip_write');

select tests.authenticate_as('frank');
select is((select status from public.create_trip('First', 'USD')),
  'ok', 'the first trip in the window is created');
select is((select status from public.create_trip('Second', 'USD')),
  'rate_limited', 'creating past the limit is refused');

reset role;
select tests.clear_auth();
insert into tests.ids (name, id)
select 'First', id from public.trips where organizer_id = tests.id('frank');

select tests.authenticate_as('frank');
select is(public.update_trip(tests.id('First'), 'First, renamed'),
  'ok', 'the first edit in the window is saved');
select is(public.update_trip(tests.id('First'), 'First, again'),
  'rate_limited', 'editing past the limit is refused');
select is(public.delete_trip(tests.id('First')),
  'rate_limited', 'edits, deletes, leaves and removals share one limit');

reset role;
select tests.clear_auth();
select results_eq(
  $$ select name from public.trips where organizer_id = tests.id('frank') $$,
  $$ values ('First, renamed'::text) $$,
  'refused writes change nothing'
);

select * from finish();
rollback;
