-- Catalog-level guards that keep the hardening from regressing.
begin;
select plan(7);

select tests.create_user('alice');
select tests.create_user('bob');
update public.profiles set is_moderator = true where id = tests.id('alice');

select is_empty(
  $$ select p.oid::regprocedure::text
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')
       and p.prosecdef
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}')) as c(setting)
         where c.setting like 'search_path=%'
       ) $$,
  'every security definer function pins search_path'
);
select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'insert'),
  'clients cannot insert profiles'
);
select ok(
  not has_table_privilege('authenticated', 'public.tos_acceptances', 'insert'),
  'clients cannot insert ToS acceptances'
);
select ok(
  not has_function_privilege('anon', 'public.complete_onboarding(text, text, text, text, text)', 'execute'),
  'anon cannot call complete_onboarding'
);

select tests.authenticate_as('bob');
select is(
  public.is_moderator(tests.id('alice')),
  false,
  'is_moderator() does not reveal other people'
);

reset role;
select tests.authenticate_as('alice');
select is(public.is_moderator(tests.id('alice')), true, 'a moderator can check themselves');
select is(public.is_moderator(tests.id('bob')), false, 'and only themselves');

select * from finish();
rollback;
