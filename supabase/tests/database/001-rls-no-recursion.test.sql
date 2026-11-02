-- Finding 1 (P0): trip_members' read policy queried trip_members itself, so
-- Postgres raised 42P17 "infinite recursion detected in policy" for every
-- signed-in read of profiles, trips and trip_members.
begin;
select plan(9);

select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_trip('alice', 'Lisbon weekend', 'private');

select tests.authenticate_as('alice');
select lives_ok($$ select * from public.profiles $$, 'signed in: profiles can be read');
select lives_ok($$ select * from public.trips $$, 'signed in: trips can be read');
select lives_ok($$ select * from public.trip_members $$, 'signed in: trip_members can be read');
select lives_ok(
  $$ update public.profiles set bio = 'Planning Lisbon' where id = tests.id('alice') $$,
  'signed in: your own profile can be updated'
);
select is(
  (select count(*)::int from public.trips where id = tests.id('Lisbon weekend')),
  1,
  'the organizer sees their private trip'
);
select is(
  (select count(*)::int from public.trip_members where trip_id = tests.id('Lisbon weekend')),
  1,
  'the organizer sees the membership list'
);

reset role;
select tests.authenticate_as('bob');
select is(
  (select count(*)::int from public.trips where id = tests.id('Lisbon weekend')),
  0,
  'a non-member does not see a private trip'
);

reset role;
select tests.authenticate_as_anon();
select lives_ok($$ select * from public.profiles $$, 'anon: profiles can be read');
select lives_ok($$ select * from public.trips $$, 'anon: trips can be read');

select * from finish();
rollback;
