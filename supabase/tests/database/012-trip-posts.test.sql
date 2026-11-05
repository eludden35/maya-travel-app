-- tripplanner-2o5.6: text posts in a trip. Members read and write them; anon,
-- strangers, followers of a member and viewers of a public trip see none, on
-- private, unlisted and public trips alike. Only the author deletes a post
-- (founder decision, test plan section 12 Q1, 2026-11-03). Report and
-- moderation cases are in 013-reports.test.sql.
begin;
select plan(53);

select tests.create_user('alice');   -- organizer
select tests.create_user('bob');     -- member; writes most posts
select tests.create_user('carol');   -- member
select tests.create_user('dave');    -- stranger; can open the public trip
select tests.create_user('erin');    -- follows Bob; in no trip
select tests.create_user('frank');   -- rate limits

select tests.create_trip('alice', 'Private trip');
select tests.create_trip('alice', 'Unlisted trip', 'unlisted');
select tests.create_trip('alice', 'Public trip', 'public');
select tests.create_trip('frank', 'Frank trip');

insert into public.trip_members (trip_id, profile_id, role)
select t.id, m.id, 'member'
from (values (tests.id('Private trip')), (tests.id('Unlisted trip')), (tests.id('Public trip'))) as t(id)
cross join (values (tests.id('bob')), (tests.id('carol'))) as m(id);

insert into public.follows (follower_id, followee_id)
values (tests.id('erin'), tests.id('bob'));

-- ----------------------------------------------------------------------------
-- Who may call, and the limits the founder chose
-- ----------------------------------------------------------------------------

select is_empty(
  $$ select f
     from unnest(array[
       'public.create_trip_post(uuid, text)',
       'public.delete_trip_post(uuid)',
       'public.get_trip_posts(uuid, uuid, integer)'
     ]) as f
     where has_function_privilege('anon', f, 'execute') $$,
  'anon cannot call any post RPC'
);
select ok(
  not has_table_privilege('anon', 'public.trip_posts', 'select'),
  'anon has no access to trip_posts at all'
);
select results_eq(
  $$ select surface, max_count, window_seconds
     from private.rate_limit_rules
     where surface in ('post', 'post_daily', 'report')
     order by surface $$,
  $$ values ('post', 10, 3600), ('post_daily', 30, 86400), ('report', 10, 3600) $$,
  'limits: 10 posts an hour, 30 a day, and 10 reports an hour'
);

select tests.authenticate_as('bob');
select throws_ok(
  $$ insert into public.trip_posts (trip_id, author_id, body)
     values (tests.id('Private trip'), tests.id('bob'), 'Sneaky') $$,
  '42501', null,
  'clients cannot insert posts directly, so the rate limit cannot be skipped'
);
select throws_ok(
  $$ update public.trip_posts set body = 'Edited' $$,
  '42501', null,
  'nobody edits a post'
);
select throws_ok(
  $$ delete from public.trip_posts $$,
  '42501', null,
  'clients cannot delete posts directly'
);

-- ----------------------------------------------------------------------------
-- Posting
-- ----------------------------------------------------------------------------

select is(
  (select status from public.create_trip_post(
     tests.id('Private trip'), E'  Landing at 3.\r\nWho''s grabbing the van?  ')),
  'ok',
  'a member can post in their trip'
);

reset role;
select tests.clear_auth();
insert into tests.ids (name, id)
select 'landing', id from public.trip_posts where body like 'Landing at 3.%';

select is(
  (select body from public.trip_posts where id = tests.id('landing')),
  E'Landing at 3.\nWho''s grabbing the van?',
  'the text is trimmed and its line breaks are stored as \n'
);
select results_eq(
  $$ select surface, count
     from public.rate_limit_counters
     where profile_id = tests.id('bob')
     order by surface $$,
  $$ values ('post', 1), ('post_daily', 1) $$,
  'posting charges the hourly and the daily limit'
);

select tests.authenticate_as('bob');
select is((select status from public.create_trip_post(tests.id('Private trip'), E' \n\t ')),
  'invalid_body', 'a blank post is refused');
select is((select status from public.create_trip_post(tests.id('Private trip'), repeat('x', 2001))),
  'invalid_body', 'a post over 2000 characters is refused');
select is((select status from public.create_trip_post(tests.id('Private trip'), E'Ring the bell\x07')),
  'invalid_body', 'control characters are refused');
select is((select status from public.create_trip_post(tests.id('Private trip'), null)),
  'invalid_body', 'a post needs text');
select is(
  (select status from public.create_trip_post(tests.id('Private trip'), repeat('x', 1998) || E'\r\ny')),
  'ok',
  'a line break counts as one character, so 2000 characters with one fit'
);

reset role;
select tests.clear_auth();
insert into tests.ids (name, id)
select 'long', id from public.trip_posts where body like 'xxx%';

select is(
  (select count from public.rate_limit_counters
   where profile_id = tests.id('bob') and surface = 'post'),
  2,
  'refused posts do not use up the limit'
);

select is(
  (select status from public.create_trip_post(tests.id('Private trip'), 'Hello')),
  'unauthorized',
  'a caller with no user is refused'
);

select tests.authenticate_as('dave');
select is((select status from public.create_trip_post(tests.id('Public trip'), 'Hello')),
  'not_found', 'a stranger cannot post, even in a public trip');

reset role;
select tests.authenticate_as('erin');
select is((select status from public.create_trip_post(tests.id('Private trip'), 'Hi Bob')),
  'not_found', 'following a member does not let you post in their trip');

-- ----------------------------------------------------------------------------
-- Only members read posts, whatever the trip's visibility
-- ----------------------------------------------------------------------------

reset role;
select tests.clear_auth();
insert into public.trip_posts (trip_id, author_id, body, created_at) values
  (tests.id('Private trip'), tests.id('alice'), 'Alice, private', now() - interval '3 hours'),
  (tests.id('Private trip'), tests.id('carol'), 'Carol, private', now() - interval '2 hours'),
  (tests.id('Unlisted trip'), tests.id('bob'), 'Bob, unlisted', now() - interval '2 hours'),
  (tests.id('Unlisted trip'), tests.id('carol'), 'Carol, unlisted', now() - interval '1 hour'),
  (tests.id('Public trip'), tests.id('bob'), 'Bob, public', now() - interval '1 hour');
insert into tests.ids (name, id)
select lower(body), id from public.trip_posts where body like '%,%';
-- Bob's two posts were written in this transaction, at the same now().
update public.trip_posts set created_at = now() - interval '30 minutes' where id = tests.id('landing');
update public.trip_posts set created_at = now() - interval '10 minutes' where id = tests.id('long');

select tests.authenticate_as_anon();
select throws_ok(
  $$ select count(*) from public.trip_posts $$,
  '42501', null,
  'anon cannot read posts'
);

reset role;
select tests.authenticate_as('dave');
select is(
  (select count(*)::int from public.trips where id = tests.id('Public trip')),
  1,
  'a stranger can open the public trip itself'
);
select is_empty(
  $$ select * from public.trip_posts $$,
  'a stranger reads no posts from private, unlisted or public trips'
);
select is_empty(
  $$ select * from public.get_trip_posts(tests.id('Private trip'))
     union all select * from public.get_trip_posts(tests.id('Unlisted trip'))
     union all select * from public.get_trip_posts(tests.id('Public trip')) $$,
  'get_trip_posts gives a stranger nothing on any of the three'
);

reset role;
select tests.authenticate_as('erin');
select is_empty(
  $$ select * from public.trip_posts $$,
  'a follower of a member reads no posts'
);
select is_empty(
  $$ select * from public.get_trip_posts(tests.id('Private trip'))
     union all select * from public.get_trip_posts(tests.id('Unlisted trip'))
     union all select * from public.get_trip_posts(tests.id('Public trip')) $$,
  'get_trip_posts gives a follower of a member nothing'
);

reset role;
select tests.authenticate_as('carol');
select results_eq(
  $$ select left(body, 12) from public.get_trip_posts(tests.id('Private trip')) $$,
  $$ values ('xxxxxxxxxxxx'), ('Landing at 3'), ('Carol, priva'), ('Alice, priva') $$,
  'members read the posts newest first'
);
select results_eq(
  $$ select author_handle, author_display_name, is_own, taken_down, reported_by_me
     from public.get_trip_posts(tests.id('Private trip')) $$,
  $$ values ('t_bob', 'Bob', false, false, false),
            ('t_bob', 'Bob', false, false, false),
            ('t_carol', 'Carol', true, false, false),
            ('t_alice', 'Alice', false, false, false) $$,
  'each post carries its author''s name, and is_own marks the caller''s'
);
select is(
  (select count(*)::int from public.trip_posts where trip_id = tests.id('Private trip')),
  4,
  'members read the same posts from the table'
);
select results_eq(
  $$ select left(body, 12) from public.get_trip_posts(tests.id('Private trip'), null, 2) $$,
  $$ values ('xxxxxxxxxxxx'), ('Landing at 3') $$,
  'a page holds p_limit posts'
);
select results_eq(
  $$ select left(body, 12) from public.get_trip_posts(tests.id('Private trip'), tests.id('landing'), 2) $$,
  $$ values ('Carol, priva'), ('Alice, priva') $$,
  'the next page starts after the last post of the one before'
);
select is_empty(
  $$ select * from public.get_trip_posts(tests.id('Private trip'), tests.id('bob, public')) $$,
  'a cursor from another trip returns nothing'
);

-- ----------------------------------------------------------------------------
-- Only the author deletes
-- ----------------------------------------------------------------------------

reset role;
select tests.authenticate_as('alice');
select is(public.delete_trip_post(tests.id('carol, private')),
  'forbidden', 'the organizer cannot delete someone else''s post');

reset role;
select tests.authenticate_as('dave');
select is(public.delete_trip_post(tests.id('carol, private')),
  'not_found', 'a stranger cannot delete a post or learn that it exists');

reset role;
select tests.authenticate_as('carol');
select is(public.delete_trip_post(tests.id('carol, private')),
  'ok', 'the author can delete their post');
select is(public.delete_trip_post(tests.id('carol, private')),
  'not_found', 'a deleted post is gone');

reset role;
select tests.clear_auth();
select is(
  (select count(*)::int from public.trip_posts where id = tests.id('carol, private')),
  0,
  'deleting removes the row'
);

-- ----------------------------------------------------------------------------
-- A post taken down after a report (012 covers how it gets there)
-- ----------------------------------------------------------------------------

update public.trip_posts
set taken_down_at = now(), taken_down_by = tests.id('alice')
where id = tests.id('landing');

select tests.authenticate_as('carol');
select is_empty(
  $$ select * from public.trip_posts where id = tests.id('landing') $$,
  'a taken-down post disappears for the other members'
);
select is(
  (select count(*)::int from public.get_trip_posts(tests.id('Private trip'))
   where id = tests.id('landing')),
  0,
  'get_trip_posts leaves it out for them too'
);

reset role;
select tests.authenticate_as('bob');
select results_eq(
  $$ select is_own, taken_down from public.get_trip_posts(tests.id('Private trip'))
     where id = tests.id('landing') $$,
  $$ values (true, true) $$,
  'its author still sees it, marked as taken down'
);

reset role;
select tests.authenticate_as('alice');
select is(public.delete_trip_post(tests.id('landing')),
  'not_found', 'to everyone else a taken-down post is not found');

-- ----------------------------------------------------------------------------
-- A block between members doesn't hide posts or names inside their trip (Q5)
-- ----------------------------------------------------------------------------

reset role;
select tests.clear_auth();
insert into public.blocks (blocker_id, blocked_id)
values (tests.id('carol'), tests.id('bob'));

select tests.authenticate_as('carol');
select is(
  (select author_display_name from public.get_trip_posts(tests.id('Private trip'))
   where id = tests.id('long')),
  'Bob',
  'the blocker still sees the blocked member''s posts and name in the trip'
);

reset role;
select tests.authenticate_as('bob');
select is(
  (select author_display_name from public.get_trip_posts(tests.id('Unlisted trip'))
   where id = tests.id('carol, unlisted')),
  'Carol',
  'the blocked member still sees the blocker''s posts and name in the trip'
);
select is(
  (select count(*)::int from public.profiles where id = tests.id('carol')),
  0,
  'outside the trip, the block still hides the blocker''s profile'
);

-- ----------------------------------------------------------------------------
-- Leaving a trip, and deleting one
-- ----------------------------------------------------------------------------

select is(public.leave_trip(tests.id('Public trip')), 'ok', 'Bob leaves the public trip');
select is_empty(
  $$ select * from public.get_trip_posts(tests.id('Public trip')) $$,
  'after leaving, the trip''s posts are gone for them'
);

reset role;
select tests.authenticate_as('alice');
select results_eq(
  $$ select author_handle, body from public.get_trip_posts(tests.id('Public trip')) $$,
  $$ values ('t_bob', 'Bob, public') $$,
  'posts stay in the trip, under their author''s name, after the author leaves'
);
select is(public.delete_trip(tests.id('Unlisted trip')), 'ok', 'the organizer deletes the unlisted trip');

reset role;
select tests.clear_auth();
select is(
  (select count(*)::int from public.trip_posts where trip_id = tests.id('Unlisted trip')),
  0,
  'deleting a trip deletes its posts'
);

-- ----------------------------------------------------------------------------
-- Rate limits: hourly, then daily
-- ----------------------------------------------------------------------------

update private.rate_limit_rules set max_count = 1 where surface = 'post';

select tests.authenticate_as('frank');
select is((select status from public.create_trip_post(tests.id('Frank trip'), 'One')),
  'ok', 'the first post in the hour is saved');
select is((select status from public.create_trip_post(tests.id('Frank trip'), 'Two')),
  'rate_limited', 'posting past the hourly limit is refused');

reset role;
select tests.clear_auth();
select results_eq(
  $$ select surface, count
     from public.rate_limit_counters
     where profile_id = tests.id('frank')
     order by surface $$,
  $$ values ('post', 2), ('post_daily', 1) $$,
  'a post the hourly limit refuses does not count against the day'
);

update private.rate_limit_rules set max_count = 100 where surface = 'post';
update private.rate_limit_rules set max_count = 2 where surface = 'post_daily';

select tests.authenticate_as('frank');
select is((select status from public.create_trip_post(tests.id('Frank trip'), 'Three')),
  'ok', 'the second post of the day is saved');
select is((select status from public.create_trip_post(tests.id('Frank trip'), 'Four')),
  'rate_limited', 'posting past the daily limit is refused');

reset role;
select tests.clear_auth();
select results_eq(
  $$ select body from public.trip_posts where author_id = tests.id('frank') order by body $$,
  $$ values ('One'), ('Three') $$,
  'refused posts write nothing'
);

select * from finish();
rollback;
