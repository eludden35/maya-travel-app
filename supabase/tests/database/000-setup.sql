-- =============================================================================
-- pgTAP test helpers. Run with `supabase test db` (CI runs it after
-- `supabase db reset`).
--
-- pg_prove runs each file in its own session, in filename order. This file
-- COMMITS a `tests` schema so the later files can share these helpers; every
-- other file wraps itself in begin/rollback and leaves no data behind. The
-- `tests` schema only ever exists in local and CI databases, never in a
-- migration.
--
-- Personas are registered by name in `tests.ids`, so SQL strings passed to
-- lives_ok / throws_ok can say `tests.id('alice')` while running as any role.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

create table if not exists tests.ids (
  name  text primary key,
  id    uuid not null,
  email text
);
grant select on tests.ids to anon, authenticated;

create or replace function tests.id(p_name text)
returns uuid
language sql
stable
as $$
  select id from tests.ids where name = p_name;
$$;
grant execute on function tests.id(text) to anon, authenticated;

-- Create an auth user, optionally with a profile. Runs as the test owner, so
-- it deliberately bypasses RLS and the client grants. Adds the email to the
-- onboarding allow-list when that table exists and `p_allowlisted` is true.
create or replace function tests.create_user(
  p_name          text,
  p_with_profile  boolean default true,
  p_discoverable  boolean default true,
  p_allowlisted   boolean default true
)
returns uuid
language plpgsql
as $$
declare
  v_id    uuid := gen_random_uuid();
  v_email text := p_name || '@example.test';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated',
    'authenticated', v_email, now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

  if p_with_profile then
    insert into public.profiles (id, handle, display_name, is_discoverable)
    values (v_id, p_name, initcap(p_name), p_discoverable);
  end if;

  if p_allowlisted and to_regclass('private.onboarding_allowlist') is not null then
    execute 'insert into private.onboarding_allowlist (entry) values ($1) on conflict do nothing'
      using v_email;
  end if;

  insert into tests.ids (name, id, email) values (p_name, v_id, v_email);
  return v_id;
end;
$$;

-- Create a trip as the test owner. Also inserts the organizer's membership row
-- so tests behave the same before and after the auto-membership trigger
-- exists.
create or replace function tests.create_trip(
  p_organizer  text,
  p_name       text,
  p_visibility public.trip_visibility default 'private'
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.trips (organizer_id, name, visibility)
  values (tests.id(p_organizer), p_name, p_visibility)
  returning id into v_id;

  insert into public.trip_members (trip_id, profile_id, role)
  values (v_id, tests.id(p_organizer), 'organizer')
  on conflict do nothing;

  insert into tests.ids (name, id) values (p_name, v_id);
  return v_id;
end;
$$;

-- Act as a signed-in user for the rest of the transaction. Call it while
-- running as the test owner (after `reset role`).
create or replace function tests.authenticate_as(p_name text)
returns void
language plpgsql
as $$
declare
  v_id    uuid;
  v_email text;
begin
  select id, email into v_id, v_email from tests.ids where name = p_name;
  if v_id is null then
    raise exception 'tests.authenticate_as: unknown persona %', p_name;
  end if;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_id, 'role', 'authenticated', 'email', v_email)::text,
    true
  );
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Act as a signed-out visitor holding only the publishable key.
create or replace function tests.authenticate_as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end;
$$;

-- Forget the impersonated user. Pair with `reset role` to get back to the
-- test owner with no auth.uid().
create or replace function tests.clear_auth()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
end;
$$;

select plan(1);
select pass('test helpers installed');
select * from finish();

commit;
