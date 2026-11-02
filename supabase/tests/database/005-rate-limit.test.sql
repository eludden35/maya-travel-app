-- Finding 5 (P1): try_consume_rate_limit() trusted a caller-supplied profile
-- id and limits, and Supabase's default grants let anon call it. Its
-- replacement takes only a surface name and always charges auth.uid().
begin;
select plan(9);

select tests.create_user('alice');
select tests.create_user('bob');

select hasnt_function(
  'public', 'try_consume_rate_limit', array['uuid', 'text', 'integer', 'integer'],
  'the caller-trusting function is gone'
);
select has_function(
  'public', 'consume_rate_limit', array['text'],
  'consume_rate_limit(surface) exists'
);
select ok(
  not has_function_privilege('anon', 'public.consume_rate_limit(text)', 'execute'),
  'anon cannot execute consume_rate_limit'
);

select tests.authenticate_as('alice');
select is(public.consume_rate_limit('follow'), 0, 'an allowed call returns 0');
select is(
  (select count(*)::int from generate_series(1, 4)
   where public.consume_rate_limit('handle_create') = 0),
  4,
  'calls under the limit are allowed'
);
select is(
  public.consume_rate_limit('handle_create'),
  0,
  'the fifth handle_create call is still allowed'
);
select cmp_ok(
  public.consume_rate_limit('handle_create'), '>', 0,
  'the sixth call returns a retry-after delay'
);
select throws_ok(
  $$ select public.consume_rate_limit('not_a_surface') $$,
  '22023', null,
  'unknown surfaces are rejected'
);

reset role;
select tests.clear_auth();
select is(
  (select coalesce(sum(count), 0)::int from public.rate_limit_counters
   where profile_id = tests.id('bob')),
  0,
  'nothing was charged to bob'
);

select * from finish();
rollback;
