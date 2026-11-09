-- =============================================================================
-- Local development seed. Runs on `supabase start` / `supabase db reset`
-- against the local stack only; it is never pushed to a hosted project.
--
-- Sign in at http://localhost:3000/auth/sign-in. The code arrives in Mailpit
-- at http://127.0.0.1:54324.
--
--   alice@example.com  onboarded; organizes "Lisbon long weekend" (private),
--                      "Joshua Tree climbing" (public) and "Amalfi coast
--                      reunion" (private, 26 trip notes, 36 costs and 8
--                      payments)
--   bob@example.com    onboarded; member of the Lisbon and Amalfi trips;
--                      follows alice
--   carol@example.com  signed up but not onboarded, to try onboarding
--   founder@example.com  onboarded moderator in no trip; reviews reports at
--                        /admin/reports (set at the end of this file)
--
-- '@example.com' is allow-listed, so any new example.com address (the
-- end-to-end tests use these) can finish onboarding.
-- =============================================================================

insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'alice@example.com', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222',
   'authenticated', 'authenticated', 'bob@example.com', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333',
   'authenticated', 'authenticated', 'carol@example.com', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.email in ('alice@example.com', 'bob@example.com', 'carol@example.com');

insert into public.profiles (id, handle, display_name, bio)
values
  ('11111111-1111-4111-8111-111111111111', 'alice', 'Alice Moreno',
   'Plans the trips. Books the van.'),
  ('22222222-2222-4222-8222-222222222222', 'bob', 'Bob Okafor', null);

-- The organizer's membership row comes from the trips trigger.
insert into public.trips (id, organizer_id, name, description, start_date, end_date, visibility)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
   'Lisbon long weekend', 'Pastéis, trams and one very steep hill.',
   '2026-12-04', '2026-12-07', 'private'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111',
   'Joshua Tree climbing', null, '2027-03-12', '2027-03-15', 'public');

insert into public.trip_members (trip_id, profile_id, role)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'member');

insert into public.follows (follower_id, followee_id)
values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111');

insert into private.onboarding_allowlist (entry, note)
values ('@example.com', 'local development and end-to-end tests');

-- tripplanner-2o5.6: a moderator for /admin/reports, and two trip notes.
-- On hosted projects is_moderator is set by hand; no one can set their own.
insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-8444-444444444444',
   'authenticated', 'authenticated', 'founder@example.com', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.email = 'founder@example.com';

insert into public.profiles (id, handle, display_name, is_moderator)
values ('44444444-4444-4444-8444-444444444444', 'founder', 'Fran Founder', true);

insert into public.trip_posts (trip_id, author_id, body, created_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
   E'Booked the flat in Alfama. Check-in is from 3pm,\nand the key is in the lockbox by the door.',
   now() - interval '2 days'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222',
   'Landing at 11:40 on Friday. Anyone up for pastéis straight from the airport?',
   now() - interval '1 day');

-- tripplanner-2o5.6: a busy trip, so the end-to-end tests keep a large page
-- under test. On Next 16.2.4 a production build never finished updating a
-- page this size after a Server Action (tripplanner-tyl).
insert into public.trips (id, organizer_id, name, description, start_date, end_date, visibility)
values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111',
   'Amalfi coast reunion', 'Ten of us, one villa, far too many lemons.',
   '2027-06-10', '2027-06-17', 'private');

insert into public.trip_members (trip_id, profile_id, role)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222', 'member');

-- 26 notes, newest first five hours apart, alternating between Alice and Bob.
insert into public.trip_posts (trip_id, author_id, body, created_at)
select
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  case when n % 2 = 0 then '11111111-1111-4111-8111-111111111111'::uuid
       else '22222222-2222-4222-8222-222222222222'::uuid end,
  format('Note %s: %s', n, (array[
    'The ferry to Positano leaves at 9:10; the 11:40 is always full.',
    'Who has the villa gate code? Asking for the airport shuttle.',
    E'Dinner Saturday at Da Adolfo.\nThe boat picks us up at the pier at 7.',
    'Bring reef shoes. The beach below the villa is all pebbles.',
    'Lemon tasting in Minori: 10 places, Thursday morning.',
    'Path of the Gods walk: about 3 hours, start before the heat.',
    'Ravello concert tickets are 25 each; reply if you want one.',
    'Rental scooters need a licence photo uploaded by Friday.'
  ])[1 + (n - 1) % 8]),
  now() - make_interval(hours => n * 5)
from generate_series(1, 26) as n;

-- tripplanner-2o5.5: the same trip with a realistic amount of money on it, so
-- the end-to-end tests keep a long ledger under test on a production build.
-- 36 costs, alternating payers, mostly split evenly. Bob's payments below
-- leave him with something still to settle.
do $$
declare
  v_trip  uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_alice uuid := '11111111-1111-4111-8111-111111111111';
  v_bob   uuid := '22222222-2222-4222-8222-222222222222';
  v_id    uuid;
  v_payer uuid;
  v_cost  bigint;
begin
  for n in 1..36 loop
    v_payer := case when n % 3 = 0 then v_bob else v_alice end;
    v_cost := 1200 + n * 437;
    insert into public.expenses (trip_id, payer_id, description, amount, split, created_by, created_at)
    values (
      v_trip, v_payer,
      format('%s, day %s', (array[
        'Ferry to Positano', 'Villa groceries', 'Dinner at Da Adolfo',
        'Boat to the beach', 'Scooter rental', 'Lemon tasting',
        'Airport shuttle', 'Ravello concert', 'Gelato round'
      ])[1 + (n - 1) % 9], 1 + (n - 1) % 7),
      v_cost, 'equal', v_payer, now() - make_interval(hours => n * 4)
    )
    returning id into v_id;

    insert into public.expense_shares (expense_id, trip_id, member_id, amount)
    values
      (v_id, v_trip, v_payer, v_cost - v_cost / 2),
      (v_id, v_trip, case when v_payer = v_alice then v_bob else v_alice end, v_cost / 2);
  end loop;

  insert into public.settlements (trip_id, from_id, to_id, amount, created_by, created_at)
  select v_trip, v_bob, v_alice, 2000 + n * 150, v_bob, now() - make_interval(hours => n * 9)
  from generate_series(1, 8) as n;
end;
$$;
