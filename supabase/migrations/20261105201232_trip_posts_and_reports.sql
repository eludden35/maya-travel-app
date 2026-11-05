-- =============================================================================
-- trip_posts_and_reports: text posts inside a trip, a Report control, and the
-- founder's review of reports. Bead tripplanner-2o5.6 (UAT-1 epic
-- tripplanner-2o5).
--
-- Founder decisions (2026-11-03, test plan section 12 Q1):
--   - Nobody edits a post; only its author deletes it.
--   - Resolving a report takes the post down: it disappears for everyone but
--     its author. Dismissing a report leaves the post up.
--   - Posts are up to 2000 characters. Limits: 10 posts an hour and 30 a day;
--     10 reports an hour. Deleting your own post isn't limited.
--
-- Same shape as 20261102180000_trip_lifecycle.sql: writes are RPC-only. Each
-- RPC is security definer with search_path = '', takes identity only from
-- auth.uid(), validates before charging consume_rate_limit in the same
-- transaction, and answers with a status instead of raising. Clients can only
-- SELECT, through the policies below.
--
--   trip_posts        Members only, through private.is_trip_member. Never
--                     consults trips.visibility or follows, so a public
--                     trip's posts stay members-only in UAT-1. A post taken
--                     down after a report stays visible to its author alone.
--   reports           One per reporter and target. Keeps a copy of what was
--                     reported, so deleting the post or the trip doesn't
--                     erase it. Readable by the reporter and by moderators.
--
--   create_trip_post  a member.
--   delete_trip_post  the author.
--   get_trip_posts    members. Shows author names across a block: inside a
--                     shared trip both people keep seeing each other (founder
--                     decision Q5, 2026-11-02); outside it the block applies.
--   report_trip_post  a member who can see the post and didn't write it.
--   list_reports      moderators (public.is_moderator); no rows for anyone else.
--   decide_report     moderators; 'not_found' for anyone else.
--
-- Text only. ADR 0002 section 2 pre-moderates images, not text. Photos
-- (tripplanner-s3a.7) become columns on trip_posts behind the CSAM-scan and
-- moderator-queue gates. The full report flow (tripplanner-s3a.15) adds values
-- to report_target_type instead of creating a second reports table.
--
-- Money-privacy hard rule (ADR 0002): no monetary table is touched, and
-- nothing here returns an amount.
-- =============================================================================

create type public.report_target_type as enum ('trip_post');

-- From the Community Guidelines' list of prohibited content. Keep
-- REPORT_REASONS in lib/post-fields.ts in step; a unit test compares them.
create type public.report_reason as enum (
  'harassment',
  'hate',
  'private_info',
  'sexual',
  'spam',
  'other'
);

create type public.report_status as enum (
  'open',
  'resolved',   -- acted on: a post is taken down
  'dismissed'   -- no action
);

-- ----------------------------------------------------------------------------
-- trip_posts
-- ----------------------------------------------------------------------------

create table public.trip_posts (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips(id) on delete cascade,
  author_id     uuid not null references public.profiles(id) on delete cascade,
  body          text not null
    constraint trip_posts_body_length check (char_length(body) between 1 and 2000),
  created_at    timestamptz not null default now(),
  taken_down_at timestamptz,
  taken_down_by uuid references public.profiles(id),
  constraint trip_posts_taken_down_recorded
    check ((taken_down_at is null) = (taken_down_by is null))
);

comment on table public.trip_posts is
  'Text posts inside a trip, members only (tripplanner-2o5.6). Written through create_trip_post and delete_trip_post; read through get_trip_posts.';
comment on column public.trip_posts.taken_down_at is
  'Set when a moderator resolves a report on this post. Taken-down posts are visible to their author only.';

-- The trip page reads a trip's newest posts first, a page at a time.
create index trip_posts_trip_id_created_at_idx
  on public.trip_posts (trip_id, created_at desc, id desc);
create index trip_posts_author_id_idx
  on public.trip_posts (author_id);

alter table public.trip_posts enable row level security;

revoke all on table public.trip_posts from anon, authenticated;
grant select on table public.trip_posts to authenticated;

create policy "trip_posts_select_members"
  on public.trip_posts
  for select
  to authenticated
  using (
    private.is_trip_member(trip_id)
    and (taken_down_at is null or author_id = (select auth.uid()))
  );

-- ----------------------------------------------------------------------------
-- reports
-- ----------------------------------------------------------------------------

create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid references public.profiles(id) on delete set null,
  target_type      public.report_target_type not null,
  -- No foreign key: a report outlives what it reports.
  target_id        uuid not null,
  trip_id          uuid references public.trips(id) on delete set null,
  target_author_id uuid references public.profiles(id) on delete set null,
  reported_text    text not null,
  reason           public.report_reason not null,
  note             text
    constraint reports_note_length check (char_length(note) between 1 and 500),
  status           public.report_status not null default 'open',
  decided_by       uuid references public.profiles(id),
  decided_at       timestamptz,
  decision_note    text
    constraint reports_decision_note_length check (char_length(decision_note) between 1 and 1000),
  created_at       timestamptz not null default now(),
  constraint reports_decision_recorded check (
    (status = 'open') = (decided_at is null)
    and (status = 'open') = (decided_by is null)
  ),
  constraint reports_one_per_reporter unique (reporter_id, target_type, target_id)
);

comment on table public.reports is
  'Reports from members, reviewed by moderators (tripplanner-2o5.6; extended by tripplanner-s3a.15). Written through report_trip_post and decide_report; moderators read them through list_reports.';
comment on column public.reports.reported_text is
  'A copy of the reported content as the reporter saw it, kept after the content is deleted.';

-- The open queue, oldest first.
create index reports_open_created_at_idx
  on public.reports (created_at)
  where status = 'open';
-- Recent decisions, newest first.
create index reports_decided_at_idx
  on public.reports (decided_at desc)
  where status <> 'open';
-- Every report on one target: "reported by me" and closing them together.
create index reports_target_idx
  on public.reports (target_type, target_id);

alter table public.reports enable row level security;

revoke all on table public.reports from anon, authenticated;
grant select on table public.reports to authenticated;

create policy "reports_select_reporter_or_moderator"
  on public.reports
  for select
  to authenticated
  using (
    reporter_id = (select auth.uid())
    or public.is_moderator((select auth.uid()))
  );

-- ----------------------------------------------------------------------------
-- Rate limits. The 'post' rule was reserved at 30 an hour in
-- 20261029120000_rls_hardening.sql; posting now charges an hourly and a daily
-- window. Daily windows are aligned to midnight UTC.
-- ----------------------------------------------------------------------------

insert into private.rate_limit_rules (surface, max_count, window_seconds) values
  ('post',       10, 3600),
  ('post_daily', 30, 86400),
  ('report',     10, 3600)
on conflict (surface) do update
  set max_count      = excluded.max_count,
      window_seconds = excluded.window_seconds;

-- ----------------------------------------------------------------------------
-- Helpers. Only the RPCs below call them, as their owner.
-- ----------------------------------------------------------------------------

-- Line breaks as \n, then trimmed. Browsers send a textarea's line breaks as
-- \r\n, which would count twice against a limit the textarea counts once.
create or replace function private.clean_multiline_text(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(
    replace(replace(p_text, E'\r\n', E'\n'), E'\r', E'\n'),
    E' \t\n'
  );
$$;

-- Whether cleaned text is 1..p_max characters with no control characters
-- other than tabs and line breaks.
create or replace function private.is_valid_multiline_text(p_text text, p_max integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    char_length(p_text) between 1 and p_max
      and translate(p_text, E'\t\n', '') !~ '[[:cntrl:]]',
    false
  );
$$;

revoke all on function private.clean_multiline_text(text) from public;
revoke all on function private.is_valid_multiline_text(text, integer) from public;

-- ----------------------------------------------------------------------------
-- Post RPCs. A caller who can't see a post or trip gets 'not_found', the same
-- as for one that doesn't exist.
-- ----------------------------------------------------------------------------

-- Statuses: ok | not_found | invalid_body | rate_limited | unauthorized
create or replace function public.create_trip_post(
  p_trip_id uuid,
  p_body    text
)
returns table (status text, post_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_body    text := private.clean_multiline_text(p_body);
  v_post_id uuid;
begin
  if v_uid is null then
    return query select 'unauthorized'::text, null::uuid;
    return;
  end if;
  if not private.is_trip_member(p_trip_id) then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;
  if not private.is_valid_multiline_text(v_body, 2000) then
    return query select 'invalid_body'::text, null::uuid;
    return;
  end if;

  -- The daily window is charged only for posts the hourly one allows, so a
  -- burst of refused retries doesn't use up the rest of the day.
  if public.consume_rate_limit('post') > 0 then
    return query select 'rate_limited'::text, null::uuid;
    return;
  end if;
  if public.consume_rate_limit('post_daily') > 0 then
    return query select 'rate_limited'::text, null::uuid;
    return;
  end if;

  insert into public.trip_posts (trip_id, author_id, body)
  values (p_trip_id, v_uid, v_body)
  returning id into v_post_id;

  return query select 'ok'::text, v_post_id;
end;
$$;

-- Deletes the caller's own post. Reports on it keep their copy of the text.
-- Statuses: ok | not_found | forbidden | unauthorized
create or replace function public.delete_trip_post(p_post_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_post public.trip_posts%rowtype;
begin
  if v_uid is null then
    return 'unauthorized';
  end if;

  select * into v_post
  from public.trip_posts p
  where p.id = p_post_id
  for update;
  if not found then
    return 'not_found';
  end if;

  if v_post.author_id = v_uid then
    delete from public.trip_posts p where p.id = p_post_id;
    return 'ok';
  end if;

  -- Only someone who can see the post learns that it exists.
  if private.is_trip_member(v_post.trip_id) and v_post.taken_down_at is null then
    return 'forbidden';
  end if;
  return 'not_found';
end;
$$;

-- A trip's posts, newest first, for its members only. p_before is the last
-- post of the previous page. Reads profiles as the owner, so a block between
-- two members doesn't hide either name here, and a member who has left still
-- signs their old posts.
create or replace function public.get_trip_posts(
  p_trip_id uuid,
  p_before  uuid default null,
  p_limit   integer default 50
)
returns table (
  id                  uuid,
  author_id           uuid,
  author_handle       text,
  author_display_name text,
  body                text,
  created_at          timestamptz,
  is_own              boolean,
  taken_down          boolean,
  reported_by_me      boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.author_id,
    a.handle,
    a.display_name,
    p.body,
    p.created_at,
    p.author_id = (select auth.uid()),
    p.taken_down_at is not null,
    exists (
      select 1
      from public.reports r
      where r.target_type = 'trip_post'
        and r.target_id = p.id
        and r.reporter_id = (select auth.uid())
    )
  from public.trip_posts p
  join public.profiles a on a.id = p.author_id
  where p.trip_id = p_trip_id
    and private.is_trip_member(p_trip_id)
    and (p.taken_down_at is null or p.author_id = (select auth.uid()))
    and (
      p_before is null
      or (p.created_at, p.id) < (
        select b.created_at, b.id
        from public.trip_posts b
        where b.id = p_before
          and b.trip_id = p_trip_id
      )
    )
  order by p.created_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

-- ----------------------------------------------------------------------------
-- Report RPCs
-- ----------------------------------------------------------------------------

-- Statuses: ok | not_found | own_post | already_reported | invalid_reason |
--           invalid_note | rate_limited | unauthorized
create or replace function public.report_trip_post(
  p_post_id uuid,
  p_reason  text,
  p_note    text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_note text := nullif(private.clean_multiline_text(p_note), '');
  v_post public.trip_posts%rowtype;
begin
  if v_uid is null then
    return 'unauthorized';
  end if;

  select * into v_post
  from public.trip_posts p
  where p.id = p_post_id;
  if not found then
    return 'not_found';
  end if;
  if v_post.author_id = v_uid then
    return 'own_post';
  end if;
  if not private.is_trip_member(v_post.trip_id) or v_post.taken_down_at is not null then
    return 'not_found';
  end if;

  if p_reason is null
     or not (p_reason = any (enum_range(null::public.report_reason)::text[])) then
    return 'invalid_reason';
  end if;
  if v_note is not null and not private.is_valid_multiline_text(v_note, 500) then
    return 'invalid_note';
  end if;
  if exists (
    select 1
    from public.reports r
    where r.reporter_id = v_uid
      and r.target_type = 'trip_post'
      and r.target_id = p_post_id
  ) then
    return 'already_reported';
  end if;

  if public.consume_rate_limit('report') > 0 then
    return 'rate_limited';
  end if;

  insert into public.reports (
    reporter_id, target_type, target_id, trip_id, target_author_id,
    reported_text, reason, note
  )
  values (
    v_uid, 'trip_post', v_post.id, v_post.trip_id, v_post.author_id,
    v_post.body, p_reason::public.report_reason, v_note
  )
  on conflict on constraint reports_one_per_reporter do nothing;

  if not found then
    return 'already_reported';
  end if;
  return 'ok';
end;
$$;

-- Reports for moderators: open ones oldest first, or decided ones newest
-- first. Anyone else gets no rows. Never returns an amount (test plan S6-N4).
-- target_state: 'up' | 'taken_down' | 'deleted'
create or replace function public.list_reports(
  p_open  boolean default true,
  p_limit integer default 50
)
returns table (
  id                    uuid,
  created_at            timestamptz,
  reason                public.report_reason,
  note                  text,
  status                public.report_status,
  target_type           public.report_target_type,
  target_id             uuid,
  target_state          text,
  reported_text         text,
  trip_id               uuid,
  trip_name             text,
  author_handle         text,
  author_display_name   text,
  reporter_handle       text,
  reporter_display_name text,
  decided_at            timestamptz,
  decided_by_handle     text,
  decision_note         text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.created_at,
    r.reason,
    r.note,
    r.status,
    r.target_type,
    r.target_id,
    case
      when p.id is null then 'deleted'
      when p.taken_down_at is not null then 'taken_down'
      else 'up'
    end,
    r.reported_text,
    r.trip_id,
    t.name,
    author.handle,
    author.display_name,
    reporter.handle,
    reporter.display_name,
    r.decided_at,
    decider.handle,
    r.decision_note
  from public.reports r
  left join public.trip_posts p
    on r.target_type = 'trip_post' and p.id = r.target_id
  left join public.trips t on t.id = r.trip_id
  left join public.profiles author on author.id = r.target_author_id
  left join public.profiles reporter on reporter.id = r.reporter_id
  left join public.profiles decider on decider.id = r.decided_by
  where public.is_moderator((select auth.uid()))
    and (r.status = 'open') = coalesce(p_open, true)
  order by
    case when coalesce(p_open, true) then r.created_at end asc,
    r.decided_at desc,
    r.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- Records a moderator's decision on an open report. 'resolve' takes a post
-- down and resolves every open report on it; 'dismiss' closes only this one.
-- Statuses: ok | not_found | invalid_decision | invalid_note |
--           already_decided | unauthorized
create or replace function public.decide_report(
  p_report_id uuid,
  p_decision  text,
  p_note      text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_note   text := nullif(private.clean_multiline_text(p_note), '');
  v_report public.reports%rowtype;
begin
  if v_uid is null then
    return 'unauthorized';
  end if;
  -- Anyone but a moderator learns nothing, not even that the report exists.
  if not public.is_moderator(v_uid) then
    return 'not_found';
  end if;
  if p_decision is null or p_decision not in ('resolve', 'dismiss') then
    return 'invalid_decision';
  end if;
  if v_note is not null and not private.is_valid_multiline_text(v_note, 1000) then
    return 'invalid_note';
  end if;

  select * into v_report
  from public.reports r
  where r.id = p_report_id
  for update;
  if not found then
    return 'not_found';
  end if;
  if v_report.status <> 'open' then
    return 'already_decided';
  end if;

  if p_decision = 'dismiss' then
    update public.reports r
    set status        = 'dismissed',
        decided_by    = v_uid,
        decided_at    = now(),
        decision_note = v_note
    where r.id = p_report_id;
    return 'ok';
  end if;

  if v_report.target_type = 'trip_post' then
    update public.trip_posts p
    set taken_down_at = now(),
        taken_down_by = v_uid
    where p.id = v_report.target_id
      and p.taken_down_at is null;
  end if;

  update public.reports r
  set status        = 'resolved',
      decided_by    = v_uid,
      decided_at    = now(),
      decision_note = v_note
  where r.target_type = v_report.target_type
    and r.target_id = v_report.target_id
    and r.status = 'open';
  return 'ok';
end;
$$;

revoke all on function public.create_trip_post(uuid, text) from public, anon;
revoke all on function public.delete_trip_post(uuid) from public, anon;
revoke all on function public.get_trip_posts(uuid, uuid, integer) from public, anon;
revoke all on function public.report_trip_post(uuid, text, text) from public, anon;
revoke all on function public.list_reports(boolean, integer) from public, anon;
revoke all on function public.decide_report(uuid, text, text) from public, anon;
grant execute on function public.create_trip_post(uuid, text) to authenticated, service_role;
grant execute on function public.delete_trip_post(uuid) to authenticated, service_role;
grant execute on function public.get_trip_posts(uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.report_trip_post(uuid, text, text) to authenticated, service_role;
grant execute on function public.list_reports(boolean, integer) to authenticated, service_role;
grant execute on function public.decide_report(uuid, text, text) to authenticated, service_role;
