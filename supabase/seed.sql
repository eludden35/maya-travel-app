-- =============================================================================
-- Local development seed. Runs on `supabase start` / `supabase db reset`
-- against the local stack only; it is never pushed to a hosted project.
--
-- Sign in at http://localhost:3000/auth/sign-in. The code arrives in Mailpit
-- at http://127.0.0.1:54324.
--
--   alice@example.com  onboarded; organizes "Lisbon long weekend" (private)
--                      and "Joshua Tree climbing" (public)
--   bob@example.com    onboarded; member of the Lisbon trip; follows alice
--   carol@example.com  signed up but not onboarded, to try onboarding
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
