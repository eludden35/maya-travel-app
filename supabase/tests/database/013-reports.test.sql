-- tripplanner-2o5.6: reporting a post, and a moderator's decision. A member
-- reports a post they can see and didn't write; only the reporter and
-- moderators can read a report. Resolving takes the post down for everyone
-- but its author and resolves every open report on it; dismissing leaves the
-- post up (founder decision, 2026-11-03). Reports keep a copy of the text.
begin;
select plan(56);

select tests.create_user('alice');   -- organizer
select tests.create_user('bob');     -- member; wrote the posts
select tests.create_user('carol');   -- member; reports
select tests.create_user('dave');    -- stranger
select tests.create_user('erin');    -- member; reports too
select tests.create_user('frank');   -- member; rate limits
select tests.create_user('mona');    -- moderator, in no trip
update public.profiles set is_moderator = true where id = tests.id('mona');

select tests.create_trip('alice', 'Lisbon');
insert into public.trip_members (trip_id, profile_id, role) values
  (tests.id('Lisbon'), tests.id('bob'), 'member'),
  (tests.id('Lisbon'), tests.id('carol'), 'member'),
  (tests.id('Lisbon'), tests.id('erin'), 'member'),
  (tests.id('Lisbon'), tests.id('frank'), 'member');

insert into public.trip_posts (trip_id, author_id, body, created_at) values
  (tests.id('Lisbon'), tests.id('alice'), 'Organizer post', now() - interval '3 hours'),
  (tests.id('Lisbon'), tests.id('bob'), 'Rude post', now() - interval '2 hours'),
  (tests.id('Lisbon'), tests.id('bob'), 'Fine post', now() - interval '1 hour');
insert into tests.ids (name, id)
select body, id from public.trip_posts where trip_id = tests.id('Lisbon');

-- ----------------------------------------------------------------------------
-- Who may call
-- ----------------------------------------------------------------------------

select is_empty(
  $$ select f
     from unnest(array[
       'public.report_trip_post(uuid, text, text)',
       'public.list_reports(boolean, integer)',
       'public.decide_report(uuid, text, text)'
     ]) as f
     where has_function_privilege('anon', f, 'execute') $$,
  'anon cannot call any report RPC'
);
select ok(
  not has_table_privilege('anon', 'public.reports', 'select'),
  'anon has no access to reports at all'
);

select tests.authenticate_as('carol');
select throws_ok(
  $$ insert into public.reports (reporter_id, target_type, target_id, reported_text, reason)
     values (tests.id('carol'), 'trip_post', tests.id('Rude post'), 'Rude post', 'spam') $$,
  '42501', null,
  'clients cannot insert reports directly'
);
select throws_ok(
  $$ update public.reports set status = 'dismissed' $$,
  '42501', null,
  'clients cannot update reports'
);
select throws_ok(
  $$ delete from public.reports $$,
  '42501', null,
  'clients cannot delete reports'
);
select throws_ok(
  $$ update public.profiles set is_moderator = true where id = tests.id('carol') $$,
  '42501', null,
  'a member cannot make themselves a moderator'
);

-- ----------------------------------------------------------------------------
-- Reporting
-- ----------------------------------------------------------------------------

select is(
  public.report_trip_post(tests.id('Rude post'), 'harassment', E'  Aimed at me.\r\n  '),
  'ok',
  'a member can report someone else''s post'
);

reset role;
select tests.clear_auth();
select results_eq(
  $$ select reporter_id, target_type::text, target_id, trip_id, target_author_id,
            reported_text, reason::text, note, status::text
     from public.reports $$,
  $$ values (tests.id('carol'), 'trip_post', tests.id('Rude post'), tests.id('Lisbon'),
             tests.id('bob'), 'Rude post', 'harassment', 'Aimed at me.', 'open') $$,
  'the report records who, what, where, why, and a copy of the text'
);
select is(
  (select count from public.rate_limit_counters
   where profile_id = tests.id('carol') and surface = 'report'),
  1,
  'reporting charges the report limit'
);

select tests.authenticate_as('carol');
select is(public.report_trip_post(tests.id('Rude post'), 'spam'),
  'already_reported', 'one report per person per post');
select is(public.report_trip_post(tests.id('Fine post'), 'rude'),
  'invalid_reason', 'the reason must be one of the listed ones');
select is(public.report_trip_post(tests.id('Fine post'), null),
  'invalid_reason', 'a reason is required');
select is(public.report_trip_post(tests.id('Fine post'), 'other', repeat('x', 501)),
  'invalid_note', 'a note over 500 characters is refused');
select is(public.report_trip_post(gen_random_uuid(), 'spam'),
  'not_found', 'a post that doesn''t exist is not found');

reset role;
select tests.authenticate_as('bob');
select is(public.report_trip_post(tests.id('Rude post'), 'spam'),
  'own_post', 'nobody reports their own post');

reset role;
select tests.authenticate_as('dave');
select is(public.report_trip_post(tests.id('Rude post'), 'spam'),
  'not_found', 'a stranger cannot report a post they cannot see');

reset role;
select tests.authenticate_as('mona');
select is(public.report_trip_post(tests.id('Rude post'), 'spam'),
  'not_found', 'a moderator outside the trip cannot report its posts either');
select is_empty(
  $$ select * from public.get_trip_posts(tests.id('Lisbon')) $$,
  'a moderator outside the trip reads none of its posts'
);

reset role;
select tests.clear_auth();
select is(
  (select count(*)::int from public.reports),
  1,
  'refused reports write nothing'
);
select is(
  (select count from public.rate_limit_counters
   where profile_id = tests.id('carol') and surface = 'report'),
  1,
  'refused reports do not use up the limit'
);

select tests.authenticate_as('carol');
select results_eq(
  $$ select body, reported_by_me from public.get_trip_posts(tests.id('Lisbon')) $$,
  $$ values ('Fine post', false), ('Rude post', true), ('Organizer post', false) $$,
  'the reporter sees which post they reported'
);

reset role;
select tests.authenticate_as('alice');
select is(
  (select count(*)::int from public.get_trip_posts(tests.id('Lisbon')) where reported_by_me),
  0,
  'nobody else sees that it was reported'
);

-- ----------------------------------------------------------------------------
-- Only the reporter and moderators read a report
-- ----------------------------------------------------------------------------

select is_empty($$ select * from public.reports $$, 'the organizer cannot read reports');

reset role;
select tests.authenticate_as('bob');
select is_empty($$ select * from public.reports $$, 'the reported author cannot read reports about them');

reset role;
select tests.authenticate_as('erin');
select is_empty($$ select * from public.reports $$, 'another member cannot read reports');

reset role;
select tests.authenticate_as('dave');
select is_empty($$ select * from public.reports $$, 'a stranger cannot read reports');

reset role;
select tests.authenticate_as_anon();
select throws_ok(
  $$ select count(*) from public.reports $$,
  '42501', null,
  'anon cannot read reports'
);

reset role;
select tests.authenticate_as('carol');
select is(
  (select count(*)::int from public.reports where reporter_id = tests.id('carol')),
  1,
  'the reporter can read their own report'
);
select is_empty(
  $$ select * from public.list_reports() $$,
  'list_reports gives a non-moderator nothing'
);

reset role;
select tests.authenticate_as('mona');
select is((select count(*)::int from public.reports), 1, 'a moderator can read every report');
select results_eq(
  $$ select reported_text, target_state, trip_name, author_handle, reporter_handle, reason::text, note
     from public.list_reports() $$,
  $$ values ('Rude post', 'up', 'Lisbon', 't_bob', 't_carol', 'harassment', 'Aimed at me.') $$,
  'list_reports shows a moderator the post, its trip, its author and the reporter'
);

-- ----------------------------------------------------------------------------
-- Deciding
-- ----------------------------------------------------------------------------

reset role;
select tests.authenticate_as('erin');
select is(public.report_trip_post(tests.id('Rude post'), 'hate'),
  'ok', 'a second member reports the same post');
select is(
  public.decide_report((select id from public.reports where reporter_id = tests.id('erin')), 'resolve'),
  'not_found',
  'a member cannot decide a report, even their own'
);

reset role;
select tests.clear_auth();
insert into tests.ids (name, id)
select 'carol report', id from public.reports where reporter_id = tests.id('carol');
insert into tests.ids (name, id)
select 'erin report', id from public.reports where reporter_id = tests.id('erin');

select tests.authenticate_as('alice');
select is(public.decide_report(tests.id('carol report'), 'resolve'),
  'not_found', 'the organizer cannot decide a report');

reset role;
select tests.authenticate_as('mona');
select is(public.decide_report(tests.id('carol report'), 'delete'),
  'invalid_decision', 'a decision is resolve or dismiss');
select is(public.decide_report(tests.id('carol report'), 'resolve', repeat('x', 1001)),
  'invalid_note', 'a decision note over 1000 characters is refused');
select is(public.decide_report(gen_random_uuid(), 'resolve'),
  'not_found', 'a report that doesn''t exist is not found');
select is(public.decide_report(tests.id('carol report'), 'resolve', ' Took it down. '),
  'ok', 'a moderator resolves a report');
select is(public.decide_report(tests.id('erin report'), 'dismiss'),
  'already_decided', 'resolving closed the other open report on the post');

reset role;
select tests.clear_auth();
select results_eq(
  $$ select status::text, decided_by, decided_at is not null, decision_note
     from public.reports order by created_at, id $$,
  $$ values ('resolved', tests.id('mona'), true, 'Took it down.'),
            ('resolved', tests.id('mona'), true, 'Took it down.') $$,
  'both reports record who decided, when, the outcome and the note'
);

select tests.authenticate_as('alice');
select is_empty(
  $$ select * from public.trip_posts where id = tests.id('Rude post') $$,
  'resolving takes the post down for the other members'
);

reset role;
select tests.authenticate_as('bob');
select results_eq(
  $$ select taken_down from public.get_trip_posts(tests.id('Lisbon')) where id = tests.id('Rude post') $$,
  $$ values (true) $$,
  'its author still sees it, marked as taken down'
);

reset role;
select tests.authenticate_as('mona');
select is_empty($$ select * from public.list_reports() $$, 'nothing is left open');
-- Decided in one transaction, so both share decided_at: compare as a set.
select set_eq(
  $$ select reporter_handle, status::text, target_state, decided_by_handle
     from public.list_reports(false) $$,
  $$ values ('t_carol', 'resolved', 'taken_down', 't_mona'),
            ('t_erin', 'resolved', 'taken_down', 't_mona') $$,
  'decided reports list the outcome and who decided'
);

reset role;
select tests.authenticate_as('carol');
select is(public.report_trip_post(tests.id('Fine post'), 'spam'),
  'ok', 'Carol reports the fine post');

reset role;
select tests.clear_auth();
insert into tests.ids (name, id)
select 'fine report', id from public.reports where target_id = tests.id('Fine post');

select tests.authenticate_as('mona');
select is(public.decide_report(tests.id('fine report'), 'dismiss'),
  'ok', 'a moderator dismisses a report');

reset role;
select tests.authenticate_as('alice');
select is(
  (select count(*)::int from public.trip_posts where id = tests.id('Fine post')),
  1,
  'a dismissed report leaves the post up'
);

reset role;
select tests.clear_auth();
select results_eq(
  $$ select status::text, decided_by, decided_at is not null, decision_note
     from public.reports where id = tests.id('fine report') $$,
  $$ values ('dismissed', tests.id('mona'), true, null::text) $$,
  'a dismissal records who and when, with no note required'
);

-- ----------------------------------------------------------------------------
-- Rate limit
-- ----------------------------------------------------------------------------

update private.rate_limit_rules set max_count = 1 where surface = 'report';

select tests.authenticate_as('frank');
select is(public.report_trip_post(tests.id('Organizer post'), 'other'),
  'ok', 'the first report in the hour is saved');
select is(public.report_trip_post(tests.id('Fine post'), 'spam'),
  'rate_limited', 'reporting past the limit is refused');

reset role;
select tests.clear_auth();
select is(
  (select count(*)::int from public.reports where reporter_id = tests.id('frank')),
  1,
  'a refused report writes nothing'
);

-- ----------------------------------------------------------------------------
-- A report outlives its post and its trip
-- ----------------------------------------------------------------------------

select tests.authenticate_as('bob');
select is(public.delete_trip_post(tests.id('Rude post')),
  'ok', 'the author can delete a taken-down post');

reset role;
select tests.authenticate_as('mona');
select results_eq(
  $$ select distinct reported_text, target_state from public.list_reports(false)
     where target_id = tests.id('Rude post') $$,
  $$ values ('Rude post', 'deleted') $$,
  'the reports keep the deleted post''s text'
);

reset role;
select tests.authenticate_as('alice');
select is(public.delete_trip(tests.id('Lisbon')), 'ok', 'the organizer deletes the trip');

reset role;
select tests.clear_auth();
select results_eq(
  $$ select count(*)::int, count(trip_id)::int from public.reports $$,
  $$ values (4, 0) $$,
  'deleting the trip keeps its reports, without the trip'
);

select tests.authenticate_as('mona');
select results_eq(
  $$ select reported_text, trip_name from public.list_reports(false)
     where target_id = tests.id('Fine post') $$,
  $$ values ('Fine post', null::text) $$,
  'a moderator still sees what was reported in a deleted trip'
);

select * from finish();
rollback;
