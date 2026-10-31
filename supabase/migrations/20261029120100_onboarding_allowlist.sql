-- =============================================================================
-- onboarding_allowlist: invite-only onboarding for UAT-1 (2026-10-29).
--
-- Anyone can request a sign-in email (Supabase creates the auth user), but
-- only allow-listed addresses can finish onboarding and get a profile. The
-- founder manages the list in the SQL editor:
--
--   insert into private.onboarding_allowlist (entry, note)
--   values ('friend@example.com', 'UAT tester');
--
-- An entry is a full email, a whole domain ('@example.com'), or '*' to open
-- onboarding to everyone when invite-only ends. The invite-links migration
-- adds the second way in: accepting a valid trip invite.
-- =============================================================================

create table private.onboarding_allowlist (
  entry      text primary key
               check (
                 entry = lower(entry)
                 and entry ~ '^(\*|@[^@\s]+\.[^@\s]+|[^@\s]+@[^@\s]+\.[^@\s]+)$'
               ),
  note       text check (note is null or length(note) <= 200),
  created_at timestamptz not null default now()
);

alter table private.onboarding_allowlist enable row level security;
revoke all on table private.onboarding_allowlist from public, anon, authenticated;

comment on table private.onboarding_allowlist is
  'Who may finish onboarding during invite-only testing: an email, an @domain, or * for everyone. Managed by hand in the SQL editor.';

create or replace function private.email_is_allowlisted(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.onboarding_allowlist a
    where a.entry = '*'
       or a.entry = lower(p_email)
       or a.entry = '@' || lower(split_part(p_email, '@', 2))
  );
$$;

revoke all on function private.email_is_allowlisted(text) from public, anon, authenticated;

-- Lets the onboarding page show the invite-only screen before the form.
-- Answers only about the caller's own email.
create or replace function public.can_complete_onboarding()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and private.email_is_allowlisted(coalesce((select auth.jwt()) ->> 'email', ''));
$$;

revoke all on function public.can_complete_onboarding() from public, anon;
grant execute on function public.can_complete_onboarding() to authenticated, service_role;

-- Same as 20261029120000_rls_hardening.sql, plus the allow-list check.
-- Statuses: ok | already_onboarded | invite_required | invalid_handle |
--           invalid_display_name | invalid_tos_version | rate_limited |
--           handle_taken | unauthorized
create or replace function public.complete_onboarding(
  p_handle       text,
  p_display_name text,
  p_tos_version  text,
  p_ip           text default null,
  p_user_agent   text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := (select auth.uid());
  v_handle       text := lower(btrim(coalesce(p_handle, '')));
  v_display_name text := btrim(coalesce(p_display_name, ''));
  v_constraint   text;
begin
  if v_uid is null then
    return 'unauthorized';
  end if;
  if exists (select 1 from public.profiles where id = v_uid) then
    return 'already_onboarded';
  end if;
  if not private.email_is_allowlisted(coalesce((select auth.jwt()) ->> 'email', '')) then
    return 'invite_required';
  end if;
  if v_handle !~ '^[a-z0-9_]{3,30}$' then
    return 'invalid_handle';
  end if;
  if char_length(v_display_name) not between 1 and 50 then
    return 'invalid_display_name';
  end if;
  if coalesce(p_tos_version, '') !~ '^v[0-9]+\.[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return 'invalid_tos_version';
  end if;

  if public.consume_rate_limit('handle_create') > 0 then
    return 'rate_limited';
  end if;

  begin
    insert into public.profiles (id, handle, display_name)
    values (v_uid, v_handle, v_display_name);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'profiles_pkey' then
        return 'already_onboarded';
      end if;
      return 'handle_taken';
  end;

  insert into public.tos_acceptances (profile_id, version, ip, user_agent)
  values (
    v_uid,
    p_tos_version,
    case when char_length(p_ip) <= 64 then p_ip end,
    nullif(left(p_user_agent, 256), '')
  )
  on conflict (profile_id, version) do nothing;

  return 'ok';
end;
$$;
