-- =============================================================================
-- Invite chaining: only links made by allow-listed accounts let new accounts
-- in. Bead tripplanner-x6a (UAT-1 epic tripplanner-2o5). The founder's
-- answer, 2026-11-05, recorded as Q11 in docs/uat/uat-1-test-plan.md
-- section 12: "Allow-listed links only".
--
-- 20261103200000_trip_invites.sql made a live link the second way past
-- private.onboarding_allowlist. Anyone a link let in could then make links
-- of their own, so invites could chain to people the founder never listed.
-- From here:
--
--   - A live link lets an email that isn't allow-listed finish onboarding
--     only if the account that made it (trip_invites.created_by) has an
--     allow-listed email. The check runs when the link is used, on that
--     account's auth.users email with private.email_is_allowlisted, so full
--     emails, @domain entries and * all count, and allow-list edits apply to
--     existing links at once. No new column.
--   - Unchanged: an allow-listed email onboards with or without a link, and a
--     live link still joins its trip during onboarding, whoever made it. So
--     an allow-listed newcomer holding a link from an organizer who isn't
--     allow-listed still joins that trip. Someone who already has a profile
--     joins through accept_trip_invite, whoever made the link.
--   - A refused attempt writes nothing: no profile, ToS row, membership or
--     use, and no rate-limit charge.
--
--   can_invite_new_accounts  the caller only: can links they make let new
--                            accounts in? The organizer's invite panel says
--                            so when they can't.
--
-- can_complete_onboarding(text) and complete_onboarding(text x6) keep their
-- signatures and statuses and are replaced in place;
-- 20261103200000_trip_invites.sql stays as it was.
--
-- Money-privacy hard rule (ADR 0002): no monetary table is touched.
-- =============================================================================

-- Is p_user_id's auth.users email on the allow-list right now? False for an
-- unknown id or a null one. Only the functions below call it, as its owner.
create or replace function private.account_is_allowlisted(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.email_is_allowlisted(coalesce(u.email, ''))
     from auth.users u
     where u.id = p_user_id),
    false
  );
$$;

revoke all on function private.account_is_allowlisted(uuid) from public, anon, authenticated;

-- Lets the onboarding page show the invite-only screen before the form.
-- Answers only about the caller's own email and the link they hold. A live
-- link counts only when the account that made it is allow-listed.
create or replace function public.can_complete_onboarding(p_invite_token text default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and (
       private.email_is_allowlisted(coalesce((select auth.jwt()) ->> 'email', ''))
       or exists (
         select 1
         from public.trip_invites i
         where private.is_invite_token(p_invite_token)
           and i.token = p_invite_token
           and private.trip_invite_problem(i) is null
           and private.account_is_allowlisted(i.created_by)
       )
     );
$$;

-- As in 20261103200000_trip_invites.sql, except that a live link admits an
-- email that isn't allow-listed only when the account that made it is
-- allow-listed. Whenever the token is live, the profile, the ToS acceptance,
-- the trip membership and the link's use still land together.
-- Statuses: ok | already_onboarded | invite_required | invalid_handle |
--           invalid_display_name | invalid_tos_version | rate_limited |
--           handle_taken | unauthorized
create or replace function public.complete_onboarding(
  p_handle       text,
  p_display_name text,
  p_tos_version  text,
  p_ip           text default null,
  p_user_agent   text default null,
  p_invite_token text default null
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
  v_invite       public.trip_invites;
begin
  if v_uid is null then
    return 'unauthorized';
  end if;
  if exists (select 1 from public.profiles where id = v_uid) then
    return 'already_onboarded';
  end if;

  v_invite := private.lock_trip_invite(p_invite_token);
  if private.trip_invite_problem(v_invite) is not null then
    v_invite := null;
  end if;
  -- Without an allow-listed email, only a live link from an allow-listed
  -- account lets someone in (x6a). This refusal comes before every write and
  -- before the rate-limit charge.
  if not private.email_is_allowlisted(coalesce((select auth.jwt()) ->> 'email', ''))
     and (v_invite.id is null or not private.account_is_allowlisted(v_invite.created_by)) then
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

  -- Any live link joins its trip, whoever made it: the caller got this far
  -- either on their own allow-listed email or on this link. A brand-new
  -- profile has no blocks yet, so Q9 has nothing to check.
  if v_invite.id is not null then
    perform private.join_trip_by_invite(v_invite, v_uid);
  end if;

  return 'ok';
end;
$$;

revoke all on function public.can_complete_onboarding(text) from public, anon;
grant execute on function public.can_complete_onboarding(text) to authenticated, service_role;
revoke all on function public.complete_onboarding(text, text, text, text, text, text) from public, anon;
grant execute on function public.complete_onboarding(text, text, text, text, text, text) to authenticated, service_role;

-- The caller only: can links they make let new accounts in? The organizer's
-- invite panel shows one line when they can't. No argument, so it can't be
-- asked about anyone else.
create or replace function public.can_invite_new_accounts()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.account_is_allowlisted((select auth.uid()));
$$;

revoke all on function public.can_invite_new_accounts() from public, anon;
grant execute on function public.can_invite_new_accounts() to authenticated, service_role;
