-- Finding 7 (P1): private trips could not be created (insert ... returning
-- failed because the read policy had no organizer branch), and an organizer
-- could add anyone to a trip without their consent.
begin;
select plan(7);

select tests.create_user('alice');
select tests.create_user('bob');

select tests.authenticate_as('alice');
select lives_ok(
  $$ insert into public.trips (organizer_id, name, visibility)
     values (tests.id('alice'), 'Secret getaway', 'private')
     returning id $$,
  'the organizer can create a private trip and read it back'
);

reset role;
select tests.clear_auth();
insert into tests.ids (name, id)
select 'Secret getaway', id from public.trips where name = 'Secret getaway';
select is(
  (select role::text from public.trip_members
   where trip_id = tests.id('Secret getaway') and profile_id = tests.id('alice')),
  'organizer',
  'creating a trip makes the organizer a member automatically'
);

select tests.authenticate_as('alice');
select throws_ok(
  $$ insert into public.trip_members (trip_id, profile_id, role)
     values (tests.id('Secret getaway'), tests.id('bob'), 'member') $$,
  '42501', null,
  'the organizer cannot add someone without their consent'
);
select lives_ok(
  $$ delete from public.trip_members
     where trip_id = tests.id('Secret getaway') and profile_id = tests.id('alice') $$,
  'deleting the organizer row is a silent no-op'
);

reset role;
select tests.clear_auth();
select is(
  (select count(*)::int from public.trip_members
   where trip_id = tests.id('Secret getaway') and role = 'organizer'),
  1,
  'the organizer row is still there'
);

select tests.authenticate_as('bob');
select throws_ok(
  $$ insert into public.trip_members (trip_id, profile_id, role)
     values (tests.id('Secret getaway'), tests.id('bob'), 'member') $$,
  '42501', null,
  'a stranger cannot add themselves to a trip'
);
select is(
  (select count(*)::int from public.trips where id = tests.id('Secret getaway')),
  0,
  'a stranger cannot see the private trip'
);

select * from finish();
rollback;
