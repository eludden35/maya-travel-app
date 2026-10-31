-- Finding 3 (P1): "unlisted" trips were returned by list queries, so anyone
-- holding the publishable key could enumerate them. Table reads now return
-- public trips plus your own; get_trip(id) opens one unlisted trip by id.
begin;
select plan(9);

select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_trip('alice', 'Private trip', 'private');
select tests.create_trip('alice', 'Unlisted trip', 'unlisted');
select tests.create_trip('alice', 'Public trip', 'public');

select tests.authenticate_as_anon();
select is(
  (select count(*)::int from public.trips where organizer_id = tests.id('alice')),
  1,
  'anon lists only the public trip'
);
select is(
  (select count(*)::int from public.trips where visibility = 'unlisted'),
  0,
  'anon cannot list unlisted trips'
);
select is(
  (select count(*)::int from public.get_trip(tests.id('Unlisted trip'))),
  1,
  'anon can open an unlisted trip by exact id'
);
select is(
  (select count(*)::int from public.get_trip(tests.id('Private trip'))),
  0,
  'anon cannot open a private trip by id'
);

reset role;
select tests.authenticate_as('bob');
select is(
  (select count(*)::int from public.trips where organizer_id = tests.id('alice')),
  1,
  'a signed-in stranger lists only the public trip'
);
select is(
  (select count(*)::int from public.get_trip(tests.id('Unlisted trip'))),
  1,
  'a signed-in stranger can open the unlisted trip by id'
);
select is(
  (select count(*)::int from public.get_trip(tests.id('Private trip'))),
  0,
  'a signed-in stranger cannot open the private trip'
);

reset role;
select tests.authenticate_as('alice');
select is(
  (select count(*)::int from public.trips where organizer_id = tests.id('alice')),
  3,
  'the organizer lists all three of their trips'
);
select is(
  (select count(*)::int from public.get_trip(tests.id('Private trip'))),
  1,
  'the organizer can open their private trip by id'
);

select * from finish();
rollback;
