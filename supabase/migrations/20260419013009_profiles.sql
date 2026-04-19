-- =============================================================================
-- profiles: public Profile entity (handle, display_name, bio, is_moderator,
--           is_discoverable) — Bead tripplanner-s3a.1, supersedes the trivial
--           profiles table originally scoped to tripplanner-bah.
--
-- Threat model (per .cursor/skills/project-architecture/SKILL.md):
--
--   1. Who can READ this data?
--      - Anyone (anon + authenticated): rows where is_discoverable = true.
--      - The owner (auth.uid() = id): always, regardless of is_discoverable.
--      - Followers + co-trip-members: NOT YET — the followers branch ships
--        with tripplanner-s3a.2 (follows table) and the co-trip-member branch
--        ships when trip_members lands. Until then, is_discoverable = false
--        collapses to "self only".
--
--   2. Who can WRITE this data?
--      - The owner: insert their own row (during onboarding) and update their
--        own row (display_name, bio, is_discoverable). The Server Action
--        layer (lib/profiles.ts) whitelists writable columns; defense in
--        depth is the privilege-escalation trigger below, which blocks
--        is_moderator changes by anyone but a service-role caller and blocks
--        any change to id.
--      - is_moderator is set MANUALLY in the Supabase dashboard at MVP.
--        There is no UI to grant moderator status.
--
--   3. What if someone outside that set sends the request anyway?
--      - SELECT outside is_discoverable=true returns no rows (RLS).
--      - INSERT for someone else's id rejected by with-check (RLS).
--      - UPDATE for someone else's row rejected by using/with-check (RLS).
--      - UPDATE that flips is_moderator true rejected by trigger.
--
--   4. Logs / PII?
--      - profiles holds public-by-default identity (handle, display_name,
--        optional bio). No email, no phone, no payment info. auth.users is
--        the source of email; profiles never duplicates it.
-- =============================================================================

-- citext: case-insensitive text. Lets `handle = 'Foo'` match `handle = 'foo'`
-- without lower() games on every read, while the check constraint below still
-- enforces a strictly-lowercase canonical form on insert.
create extension if not exists citext;

-- ----------------------------------------------------------------------------
-- Table
-- ----------------------------------------------------------------------------

create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  handle          citext not null unique
                    check (handle ~ '^[a-z0-9_]{3,30}$'),
  display_name    text not null
                    check (length(display_name) between 1 and 50),
  bio             text
                    check (bio is null or length(bio) <= 500),
  is_moderator    boolean not null default false,
  is_discoverable boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.profiles is
  'Public Profile entity. Identity row keyed 1:1 to auth.users. World-readable when is_discoverable = true. See .cursor/skills/project-architecture/SKILL.md.';
comment on column public.profiles.handle is
  'Lowercase, URL-safe, 3-30 chars [a-z0-9_]. Case-insensitive uniqueness via citext.';
comment on column public.profiles.is_moderator is
  'Granted manually via Supabase dashboard at MVP. Update path is locked by the privilege-escalation trigger below.';
comment on column public.profiles.is_discoverable is
  'When false, RLS collapses to "self only" until follows + trip_members tables exist (then expands to followers + co-trip-members per ADR 0002).';

create index profiles_handle_idx on public.profiles (handle);
create index profiles_is_moderator_idx on public.profiles (is_moderator)
  where is_moderator = true;

-- ----------------------------------------------------------------------------
-- Triggers
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Defense-in-depth: even if a writable column slips past the Server Action
-- whitelist, the trigger prevents privilege escalation and id forgery. The
-- service-role / dashboard client bypasses this trigger because RLS bypass
-- only skips RLS — but BEFORE-UPDATE triggers run for service-role too, which
-- would block dashboard edits. We allow dashboard edits by detecting the
-- absence of an authenticated request (auth.uid() returns null inside the
-- dashboard SQL runner / service-role calls).
create or replace function public.profiles_prevent_privilege_escalation()
returns trigger
language plpgsql
as $$
begin
  if new.id <> old.id then
    raise exception 'profiles.id is immutable';
  end if;

  if new.is_moderator is distinct from old.is_moderator
     and auth.uid() is not null then
    raise exception 'is_moderator can only be set via the Supabase dashboard';
  end if;

  return new;
end;
$$;

create trigger profiles_no_privilege_escalation
  before update on public.profiles
  for each row execute function public.profiles_prevent_privilege_escalation();

-- ----------------------------------------------------------------------------
-- is_moderator(profile_id) — security-definer helper
--
-- Shipped now (rather than in the moderator-queue Bead) because future RLS
-- policies on images / posts / etc. will reference it, and shipping it
-- once-and-correctly is cheaper than retrofitting every policy later. See
-- .cursor/skills/project-architecture/SKILL.md → "Moderator role + queue
-- access".
-- ----------------------------------------------------------------------------

create or replace function public.is_moderator(profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_moderator from public.profiles where id = profile_id),
    false
  );
$$;

revoke all on function public.is_moderator(uuid) from public;
grant execute on function public.is_moderator(uuid) to authenticated, anon;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.profiles enable row level security;

-- World-read for discoverable profiles; owner sees their own row regardless.
-- The "followers + co-trip-members" branch lands when those tables exist;
-- until then is_discoverable = false collapses to self-only, which is the
-- intended-conservative default while we build out the social graph.
create policy "profiles_select_discoverable_or_self"
  on public.profiles
  for select
  to authenticated, anon
  using (
    is_discoverable = true
    or auth.uid() = id
  );

-- Insert your own row only (during onboarding).
create policy "profiles_insert_self"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

-- Update your own row only. Column-level guards (is_moderator, id) are
-- enforced by the privilege-escalation trigger above.
create policy "profiles_update_self"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
