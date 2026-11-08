-- tripplanner-2o5.5: the names of people who left a trip but are still on its
-- ledger. Only the trip's current members can read them, whatever the trip's
-- visibility.
begin;
select plan(13);

select tests.create_user('alice');  -- organizer
select tests.create_user('bob');    -- current member
select tests.create_user('carol');  -- paid for something, then left
select tests.create_user('dana');   -- received a payment, then left
select tests.create_user('erin');   -- only on a deleted expense, then left
select tests.create_user('gabe');   -- left without touching the money
select tests.create_user('sam');    -- stranger
select tests.create_user('fran');   -- follows alice

select tests.create_trip('alice', 'Ledger trip');
update public.trips set visibility = 'public' where id = tests.id('Ledger trip');
insert into public.trip_members (trip_id, profile_id, role) values
  (tests.id('Ledger trip'), tests.id('bob'), 'member'),
  (tests.id('Ledger trip'), tests.id('carol'), 'member'),
  (tests.id('Ledger trip'), tests.id('dana'), 'member'),
  (tests.id('Ledger trip'), tests.id('erin'), 'member'),
  (tests.id('Ledger trip'), tests.id('gabe'), 'member');
insert into public.follows (follower_id, followee_id)
values (tests.id('fran'), tests.id('alice'));

-- Rows go in as the owner: this file tests the read, and the writes have their
-- own files. Balances don't matter here, so people simply stop being members.
with expense as (
  insert into public.expenses (trip_id, payer_id, description, amount, split, created_by)
  values (tests.id('Ledger trip'), tests.id('carol'), 'Taxi', 1000, 'equal', tests.id('carol'))
  returning id
)
insert into public.expense_shares (expense_id, trip_id, member_id, amount)
select expense.id, tests.id('Ledger trip'), member.id, 500
from expense, (values (tests.id('carol')), (tests.id('bob'))) as member (id);

with expense as (
  insert into public.expenses (trip_id, payer_id, description, amount, split, created_by, deleted_at, deleted_by)
  values (tests.id('Ledger trip'), tests.id('erin'), 'Removed', 500, 'equal', tests.id('erin'), now(), tests.id('erin'))
  returning id
)
insert into public.expense_shares (expense_id, trip_id, member_id, amount)
select expense.id, tests.id('Ledger trip'), tests.id('erin'), 500
from expense;

insert into public.settlements (trip_id, from_id, to_id, amount, created_by)
values (tests.id('Ledger trip'), tests.id('bob'), tests.id('dana'), 300, tests.id('bob'));

delete from public.trip_members
where trip_id = tests.id('Ledger trip')
  and profile_id in (tests.id('carol'), tests.id('dana'), tests.id('erin'), tests.id('gabe'));

-- The caller's view, by persona name.
create function tests.former(p_trip text)
returns setof text
language sql
stable
as $$
  select i.name
  from public.get_trip_former_members(tests.id(p_trip)) as f
  join tests.ids i on i.id = f.profile_id
  order by i.name;
$$;
grant execute on function tests.former(text) to authenticated;

select ok(
  not has_function_privilege('anon', 'public.get_trip_former_members(uuid)', 'execute'),
  'anon cannot call get_trip_former_members'
);
select ok(
  has_function_privilege('authenticated', 'public.get_trip_former_members(uuid)', 'execute'),
  'signed-in users can call get_trip_former_members'
);

select tests.authenticate_as('alice');
select results_eq(
  $$ select * from tests.former('Ledger trip') $$,
  array['carol', 'dana']::text[],
  'the organizer gets the people who left and are still on the ledger'
);
select is(
  (select display_name
   from public.get_trip_former_members(tests.id('Ledger trip'))
   where profile_id = tests.id('carol')),
  (select display_name from public.profiles where id = tests.id('carol')),
  'the name is the display name'
);

reset role;
select tests.clear_auth();
select tests.authenticate_as('bob');
select results_eq(
  $$ select * from tests.former('Ledger trip') $$,
  array['carol', 'dana']::text[],
  'another member gets the same names'
);
select ok(
  not exists (
    select 1 from tests.former('Ledger trip') as name where name in ('alice', 'bob')
  ),
  'a current member is never listed as former'
);
select ok(
  not exists (
    select 1 from tests.former('Ledger trip') as name where name in ('erin', 'gabe')
  ),
  'someone only on a deleted expense, or never on the ledger, is left out'
);

reset role;
select tests.clear_auth();
select tests.authenticate_as('carol');
select is_empty(
  $$ select 1 from public.get_trip_former_members(tests.id('Ledger trip')) $$,
  'the person who left reads nothing'
);

reset role;
select tests.clear_auth();
select tests.authenticate_as('sam');
select is_empty(
  $$ select 1 from public.get_trip_former_members(tests.id('Ledger trip')) $$,
  'a stranger reads nothing, on a public trip'
);

reset role;
select tests.clear_auth();
select tests.authenticate_as('fran');
select is_empty(
  $$ select 1 from public.get_trip_former_members(tests.id('Ledger trip')) $$,
  'a follower of the organizer reads nothing, on a public trip'
);

reset role;
select tests.clear_auth();
select tests.authenticate_as('alice');
select is_empty(
  $$ select 1 from public.get_trip_former_members(gen_random_uuid()) $$,
  'an unknown trip reads nothing'
);

reset role;
select tests.clear_auth();
set local role anon;
select throws_ok(
  $$ select * from public.get_trip_former_members(tests.id('Ledger trip')) $$,
  '42501', null,
  'anon is refused at the function'
);
reset role;

select is(
  (select array_agg(attname::text order by attnum)
   from (
     select unnest(proargnames) as attname,
            generate_subscripts(proargnames, 1) as attnum
     from pg_proc
     where oid = 'public.get_trip_former_members(uuid)'::regprocedure
   ) as args
   where attname <> 'p_trip_id'),
  array['profile_id', 'display_name'],
  'the function returns an id and a name, and no amounts'
);

select * from finish();
rollback;
