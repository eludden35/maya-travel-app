-- Finding 4 (P1): the follow policy's "they blocked me" branch ran under the
-- caller's RLS on blocks and never matched, so a blocked user could follow
-- the blocker again and still saw the blocker's profile.
begin;
select plan(8);

select tests.create_user('alice');
select tests.create_user('bob');

-- bob follows alice, then alice blocks bob.
insert into public.follows (follower_id, followee_id)
values (tests.id('bob'), tests.id('alice'));
insert into public.blocks (blocker_id, blocked_id)
values (tests.id('alice'), tests.id('bob'));

select is(
  (select count(*)::int from public.follows
   where follower_id = tests.id('bob') and followee_id = tests.id('alice')),
  0,
  'blocking removes the existing follow'
);

select tests.authenticate_as('bob');
select throws_ok(
  $$ insert into public.follows (follower_id, followee_id)
     values (tests.id('bob'), tests.id('alice')) $$,
  '42501', null,
  'the blocked user cannot follow the blocker again'
);
select is(
  (select count(*)::int from public.profiles where id = tests.id('alice')),
  0,
  'the blocked user no longer sees the blocker''s profile'
);
select is(
  (select count(*)::int from public.blocks),
  0,
  'the blocked user cannot see the block itself'
);

reset role;
select tests.authenticate_as('alice');
select is(
  (select count(*)::int from public.profiles where id = tests.id('bob')),
  1,
  'the blocker still sees the blocked profile, so they can unblock'
);
select throws_ok(
  $$ insert into public.follows (follower_id, followee_id)
     values (tests.id('alice'), tests.id('bob')) $$,
  '42501', null,
  'the blocker cannot follow the blocked user either'
);
select lives_ok(
  $$ delete from public.blocks
     where blocker_id = tests.id('alice') and blocked_id = tests.id('bob') $$,
  'the blocker can unblock'
);

reset role;
select tests.authenticate_as('bob');
select lives_ok(
  $$ insert into public.follows (follower_id, followee_id)
     values (tests.id('bob'), tests.id('alice')) $$,
  'after an unblock, following works again'
);

select * from finish();
rollback;
