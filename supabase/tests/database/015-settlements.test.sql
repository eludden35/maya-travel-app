-- tripplanner-2o5.3: settlements, voids, trip_balances and the balance rule
-- for leaving. Founder decisions (test plan section 12, Q3, 2026-11-08): either
-- party records or voids a settlement, it counts at once, any amount is
-- accepted, and balances are net per member. The fixtures are scenarios S5 and
-- S7 of docs/uat/uat-1-test-plan.md.
begin;
select plan(160);

select tests.create_user('alice');  -- organizer
select tests.create_user('bob');    -- member
select tests.create_user('carol');  -- member; settles up and leaves
select tests.create_user('dave');   -- member with no expenses; removed at zero
select tests.create_user('sam');    -- stranger
select tests.create_user('fran');   -- follows alice and bob
select tests.create_user('vic');    -- opens the unlisted and public trips by id
select tests.create_user('cody');   -- shares another trip with alice and bob
select tests.create_user('lena');   -- in the matrix trips, then leaves them
select tests.create_user('frank');  -- rate limits
select tests.create_user('gus');    -- rate limits

select tests.create_trip('alice', 'Settle trip');
insert into public.trip_members (trip_id, profile_id, role) values
  (tests.id('Settle trip'), tests.id('bob'), 'member'),
  (tests.id('Settle trip'), tests.id('carol'), 'member'),
  (tests.id('Settle trip'), tests.id('dave'), 'member');

-- The caller's view of a trip's balances, with people by name.
create function tests.balances(p_trip text)
returns table (member text, net bigint, is_member boolean)
language sql
stable
as $$
  select i.name, b.net, b.is_member
  from public.trip_balances(tests.id(p_trip)) as b
  join tests.ids i on i.id = b.member_id;
$$;
grant execute on function tests.balances(text) to authenticated;

-- Records a settlement as the caller and returns its status.
create function tests.record(p_trip text, p_from text, p_to text, p_amount bigint)
returns text
language sql
as $$
  select r.status
  from public.record_settlement(tests.id(p_trip), tests.id(p_from), tests.id(p_to), p_amount) as r;
$$;
grant execute on function tests.record(text, text, text, bigint) to authenticated;

-- ----------------------------------------------------------------------------
-- Who may call, read and write
-- ----------------------------------------------------------------------------

select is_empty(
  $$ select f
     from unnest(array[
       'public.record_settlement(uuid, uuid, uuid, bigint)',
       'public.void_settlement(uuid)',
       'public.trip_balances(uuid)'
     ]) as f
     where has_function_privilege('anon', f, 'execute') $$,
  'anon cannot call any settlement RPC'
);
select ok(
  (select bool_and(has_function_privilege('authenticated', f, 'execute'))
   from unnest(array[
     'public.record_settlement(uuid, uuid, uuid, bigint)',
     'public.void_settlement(uuid)',
     'public.trip_balances(uuid)'
   ]) as f),
  'signed-in users can call the settlement RPCs'
);
select ok(
  not has_table_privilege('anon', 'public.settlements', 'select, insert, update, delete, truncate, references, trigger'),
  'anon has no privilege on settlements'
);
select ok(
  has_table_privilege('authenticated', 'public.settlements', 'select')
  and not has_table_privilege('authenticated', 'public.settlements', 'insert, update, delete, truncate, references, trigger'),
  'signed-in users can only read settlements'
);
select ok(
  has_table_privilege('service_role', 'public.settlements', 'select')
  and not has_table_privilege('service_role', 'public.settlements', 'insert, update, delete, truncate, references, trigger'),
  'the secret key can only read settlements'
);
select is(
  (select string_agg(p.cmd || ' ' || array_to_string(p.roles, ','), '; ')
   from pg_policies p
   where p.schemaname = 'public' and p.tablename = 'settlements'),
  'SELECT authenticated',
  'settlements has one policy: SELECT, for signed-in users'
);
select is_empty(
  $$ select policyname
     from pg_policies
     where schemaname = 'public' and tablename = 'settlements'
       and qual ~* 'visibility|follow|shares_trip_with|block' $$,
  'no settlement policy looks at visibility, follows, shared trips or blocks'
);
select ok(
  not has_function_privilege('anon', 'private.trip_nets(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.trip_nets(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.trip_departure_blocker(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.trip_departure_blocker(uuid, uuid)', 'execute'),
  'nobody reaches the balance helpers directly'
);

select tests.clear_auth();
select set_config('role', 'authenticated', true);
select is(
  (select status from public.record_settlement(
     tests.id('Settle trip'), tests.id('bob'), tests.id('alice'), 100)),
  'unauthorized',
  'a caller with no user id cannot record a settlement'
);
select is(public.void_settlement(gen_random_uuid()),
  'unauthorized', 'or void one');
select is_empty(
  $$ select * from public.trip_balances(tests.id('Settle trip')) $$,
  'or read balances'
);

-- ----------------------------------------------------------------------------
-- The S5 fixture: A is owed $48.00, B owes $14.00, C owes $34.00
-- ----------------------------------------------------------------------------

reset role;
select tests.authenticate_as('alice');
select is(
  (select status from public.create_expense(
     tests.id('Settle trip'), tests.id('alice'), 'Hotel deposit', 9000, 'equal',
     array[tests.id('alice'), tests.id('bob'), tests.id('carol')])),
  'ok', 'setup: hotel deposit, $90.00 paid by A, split equally');

reset role;
select tests.authenticate_as('bob');
select is(
  (select status from public.create_expense(
     tests.id('Settle trip'), tests.id('bob'), 'Dinner', 3000, 'equal',
     array[tests.id('alice'), tests.id('bob'), tests.id('carol')])),
  'ok', 'setup: dinner, $30.00 paid by B, split equally');

reset role;
select tests.authenticate_as('carol');
select is(
  (select status from public.create_expense(
     tests.id('Settle trip'), tests.id('carol'), 'Taxi', 1200, 'exact',
     array[tests.id('alice'), tests.id('bob'), tests.id('carol')], array[200, 400, 600]::bigint[])),
  'ok', 'setup: taxi, $12.00 paid by C, exact shares');

reset role;
select tests.authenticate_as('bob');
select bag_eq(
  $$ select member, net, is_member from tests.balances('Settle trip') $$,
  $$ values ('alice'::text, 4800::bigint, true), ('bob', -1400, true),
            ('carol', -3400, true), ('dave', 0, true) $$,
  'S5 step 1: A is owed $48.00, B owes $14.00, C owes $34.00, and D has a zero row'
);
select is(
  (select sum(net)::bigint from public.trip_balances(tests.id('Settle trip'))),
  0::bigint,
  'S5-N2: balances sum to zero'
);

-- ----------------------------------------------------------------------------
-- Bad input is refused before the rate-limit charge and writes nothing
-- ----------------------------------------------------------------------------

select is(tests.record('Settle trip', 'bob', 'alice', 0),
  'invalid_amount', 'an amount of zero is refused');
select is(tests.record('Settle trip', 'bob', 'alice', -100),
  'invalid_amount', 'a negative amount is refused');
select is(tests.record('Settle trip', 'bob', 'alice', 100000000000),
  'invalid_amount', 'an amount over 999,999,999.99 is refused');
select is(tests.record('Settle trip', 'bob', 'alice', null),
  'invalid_amount', 'an amount is required');
select is(tests.record('Settle trip', 'bob', 'bob', 100),
  'same_member', 'nobody pays themselves');
select is(tests.record('Settle trip', null, 'alice', 100),
  'not_a_member', 'a payer is required');
select is(tests.record('Settle trip', 'bob', null, 100),
  'not_a_member', 'someone to pay is required');
select is(tests.record('Settle trip', 'carol', 'alice', 100),
  'forbidden', 'Q3: a member who is neither party cannot record a payment between two others');
select is(tests.record('Settle trip', 'bob', 'sam', 100),
  'not_a_member', 'someone outside the trip cannot be paid');
select is(
  (select status from public.record_settlement(
     gen_random_uuid(), tests.id('bob'), tests.id('alice'), 100)),
  'not_found',
  'a trip that does not exist is not found'
);

reset role;
select tests.authenticate_as('sam');
select is(tests.record('Settle trip', 'sam', 'alice', 100),
  'not_found', 'a stranger cannot record a settlement in the trip');

reset role;
select tests.clear_auth();
select is(
  (select count(*)::int from public.settlements where trip_id = tests.id('Settle trip')),
  0,
  'refused settlements write nothing'
);
select is(
  (select coalesce(sum(count), 0)::int from public.rate_limit_counters
   where profile_id = tests.id('bob') and surface = 'settlement_write'),
  0,
  'refused input does not use up the rate limit'
);

-- ----------------------------------------------------------------------------
-- S5 step 4: the payer marks a debt as paid
-- ----------------------------------------------------------------------------

select tests.authenticate_as('bob');
select is(tests.record('Settle trip', 'bob', 'alice', 1400),
  'ok', 'S5 step 4: the member who paid records it');

reset role;
select tests.clear_auth();
insert into tests.ids (name, id)
select 'bob paid', s.id from public.settlements s where s.trip_id = tests.id('Settle trip');

select results_eq(
  $$ select from_id, to_id, amount, reverses_id, created_by
     from public.settlements where id = tests.id('bob paid') $$,
  $$ values (tests.id('bob'), tests.id('alice'), 1400::bigint, null::uuid, tests.id('bob')) $$,
  'S5 step 4: it keeps who paid, who was paid, the amount and who marked it'
);
select is(
  (select coalesce(sum(count), 0)::int from public.rate_limit_counters
   where profile_id = tests.id('bob') and surface = 'settlement_write'),
  1,
  'recording a settlement charges settlement_write'
);

select tests.authenticate_as('carol');
select bag_eq(
  $$ select member, net, is_member from tests.balances('Settle trip') $$,
  $$ values ('alice'::text, 3400::bigint, true), ('bob', 0, true),
            ('carol', -3400, true), ('dave', 0, true) $$,
  'S5 step 4: B is at $0.00 and A at +$34.00, for every member'
);

-- ----------------------------------------------------------------------------
-- Any amount (Q3), and a void puts the balances back
-- ----------------------------------------------------------------------------

reset role;
select tests.authenticate_as('dave');
select is(tests.record('Settle trip', 'dave', 'bob', 500),
  'ok', 'Q3: a payment can be any amount, even from someone who owes nothing');
select bag_eq(
  $$ select member, net, is_member from tests.balances('Settle trip') $$,
  $$ values ('alice'::text, 3400::bigint, true), ('bob', -500, true),
            ('carol', -3400, true), ('dave', 500, true) $$,
  'an overpayment flips the balance: the payer is now owed'
);

reset role;
select tests.clear_auth();
insert into tests.ids (name, id)
select 'dave paid', s.id from public.settlements s
where s.trip_id = tests.id('Settle trip') and s.from_id = tests.id('dave');

select tests.authenticate_as('bob');
select is(public.void_settlement(tests.id('dave paid')),
  'ok', 'Q3: the member who was paid can void it');
select bag_eq(
  $$ select member, net, is_member from tests.balances('Settle trip') $$,
  $$ values ('alice'::text, 3400::bigint, true), ('bob', 0, true),
            ('carol', -3400, true), ('dave', 0, true) $$,
  'a void restores the prior balance'
);

reset role;
select tests.clear_auth();
select results_eq(
  $$ select from_id, to_id, amount, created_by
     from public.settlements where reverses_id = tests.id('dave paid') $$,
  $$ values (tests.id('bob'), tests.id('dave'), 500::bigint, tests.id('bob')) $$,
  'a void is the same amount paid back the other way, written by whoever voided it'
);

-- ----------------------------------------------------------------------------
-- S5 steps 5-7: paid, voided, paid
-- ----------------------------------------------------------------------------

select tests.authenticate_as('alice');
select is(tests.record('Settle trip', 'carol', 'alice', 3400),
  'ok', 'S5 step 5: the member who was paid can record it too');
select bag_eq(
  $$ select member, net, is_member from tests.balances('Settle trip') $$,
  $$ values ('alice'::text, 0::bigint, true), ('bob', 0, true),
            ('carol', 0, true), ('dave', 0, true) $$,
  'S5 step 5: every balance is $0.00'
);

reset role;
select tests.clear_auth();
insert into tests.ids (name, id)
select 'carol paid', s.id from public.settlements s
where s.trip_id = tests.id('Settle trip') and s.from_id = tests.id('carol');
select is(
  (select created_by from public.settlements where id = tests.id('carol paid')),
  tests.id('alice'),
  'the settlement says the payee recorded it'
);

select tests.authenticate_as('alice');
select is(public.void_settlement(tests.id('bob paid')),
  'ok', 'S5 step 6: the payee voids a payment the payer recorded');
select bag_eq(
  $$ select member, net, is_member from tests.balances('Settle trip') $$,
  $$ values ('alice'::text, 1400::bigint, true), ('bob', -1400, true),
            ('carol', 0, true), ('dave', 0, true) $$,
  'S5 step 6: B owes $14.00 again'
);

reset role;
select tests.clear_auth();
select is(
  (select coalesce(sum(count), 0)::int from public.rate_limit_counters
   where profile_id = tests.id('alice') and surface = 'settlement_write'),
  2,
  'recording and voiding each charge settlement_write'
);
select results_eq(
  $$ select (select count(*)::int from public.settlements where id = tests.id('bob paid')),
            (select count(*)::int from public.settlements where reverses_id = tests.id('bob paid')) $$,
  $$ values (1, 1) $$,
  'S5 step 6: the payment stays and a reversing entry appears'
);

select tests.authenticate_as('bob');
select is(tests.record('Settle trip', 'bob', 'alice', 1400),
  'ok', 'S5 step 7: B marks it paid again');
select bag_eq(
  $$ select member, net, is_member from tests.balances('Settle trip') $$,
  $$ values ('alice'::text, 0::bigint, true), ('bob', 0, true),
            ('carol', 0, true), ('dave', 0, true) $$,
  'S5 step 7: settled again'
);

reset role;
select tests.clear_auth();
insert into tests.ids (name, id)
select 'bob paid again', s.id from public.settlements s
where s.trip_id = tests.id('Settle trip')
  and s.from_id = tests.id('bob') and s.to_id = tests.id('alice')
  and s.id <> tests.id('bob paid');
insert into tests.ids (name, id)
select 'bob paid void', s.id from public.settlements s
where s.reverses_id = tests.id('bob paid');

select tests.authenticate_as('dave');
select results_eq(
  $$ select (count(*) filter (where reverses_id is null))::int,
            (count(*) filter (where reverses_id is not null))::int
     from public.settlements
     where trip_id = tests.id('Settle trip')
       and tests.id('bob') in (from_id, to_id)
       and tests.id('alice') in (from_id, to_id) $$,
  $$ values (2, 1) $$,
  'S5 step 7: any member reads the history: two payments and the void between them'
);

-- ----------------------------------------------------------------------------
-- Voids: once, by a party, for a payment
-- ----------------------------------------------------------------------------

reset role;
select tests.authenticate_as('alice');
select is(public.void_settlement(tests.id('bob paid')),
  'already_voided', 'S5-N1: the second void of a payment is refused');

reset role;
select tests.authenticate_as('bob');
select is(public.void_settlement(tests.id('bob paid void')),
  'not_found', 'a void cannot be voided: record the payment again');
select is(public.void_settlement(gen_random_uuid()),
  'not_found', 'a settlement that does not exist is not found');
select is(public.void_settlement(null),
  'not_found', 'neither is a null id');

reset role;
select tests.authenticate_as('carol');
select is(public.void_settlement(tests.id('bob paid again')),
  'forbidden', 'Q3: a member who is neither party cannot void it');

reset role;
select tests.authenticate_as('sam');
select is(public.void_settlement(tests.id('bob paid again')),
  'not_found', 'a stranger gets not_found');

reset role;
select tests.clear_auth();
select results_eq(
  $$ select (select coalesce(sum(count), 0)::int from public.rate_limit_counters
             where profile_id = tests.id('alice') and surface = 'settlement_write'),
            (select coalesce(sum(count), 0)::int from public.rate_limit_counters
             where profile_id = tests.id('carol') and surface = 'settlement_write') $$,
  $$ values (2, 0) $$,
  'refused voids do not use up the rate limit'
);

-- ----------------------------------------------------------------------------
-- Append-only: UPDATE and DELETE fail for everyone
-- ----------------------------------------------------------------------------

select tests.authenticate_as('alice');
select throws_ok(
  $$ insert into public.settlements (trip_id, from_id, to_id, amount, created_by)
     values (tests.id('Settle trip'), tests.id('bob'), tests.id('alice'), 100, tests.id('alice')) $$,
  '42501', null,
  'members cannot insert settlements directly'
);
select throws_ok(
  $$ update public.settlements set amount = 1 where id = tests.id('bob paid again') $$,
  '42501', null,
  'S5-N1: a party cannot edit a settlement'
);
select throws_ok(
  $$ delete from public.settlements where id = tests.id('bob paid again') $$,
  '42501', null,
  'or delete one'
);

reset role;
select tests.authenticate_as('sam');
select throws_ok(
  $$ update public.settlements set amount = 1 where id = tests.id('bob paid again') $$,
  '42501', null,
  'a stranger cannot edit a settlement'
);
select throws_ok(
  $$ delete from public.settlements where id = tests.id('bob paid again') $$,
  '42501', null,
  'or delete one'
);

reset role;
select tests.authenticate_as_anon();
select throws_ok(
  $$ update public.settlements set amount = 1 where id = tests.id('bob paid again') $$,
  '42501', null,
  'anon cannot edit a settlement'
);
select throws_ok(
  $$ delete from public.settlements where id = tests.id('bob paid again') $$,
  '42501', null,
  'or delete one'
);

reset role;
select tests.clear_auth();
select throws_ok(
  $$ update public.settlements set amount = 1 where id = tests.id('bob paid again') $$,
  '42501', null,
  'even the owner cannot edit a settlement'
);
select throws_ok(
  $$ delete from public.settlements where id = tests.id('bob paid again') $$,
  '42501', null,
  'or delete one while its trip exists'
);
select throws_ok(
  $$ truncate public.settlements $$,
  '42501', null,
  'or empty the table'
);
select is(
  (select amount from public.settlements where id = tests.id('bob paid again')),
  1400::bigint,
  'the settlement is unchanged'
);

-- ----------------------------------------------------------------------------
-- What a void has to be, whoever writes it
-- ----------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.settlements (trip_id, from_id, to_id, amount, reverses_id, created_by)
     values (tests.id('Settle trip'), tests.id('alice'), tests.id('bob'), 999,
             tests.id('bob paid again'), tests.id('alice')) $$,
  '23503', null,
  'a void is for the amount it reverses'
);
select throws_ok(
  $$ insert into public.settlements (trip_id, from_id, to_id, amount, reverses_id, created_by)
     values (tests.id('Settle trip'), tests.id('bob'), tests.id('alice'), 1400,
             tests.id('bob paid again'), tests.id('alice')) $$,
  '23503', null,
  'a void swaps the parties'
);
select throws_ok(
  $$ insert into public.settlements (trip_id, from_id, to_id, amount, reverses_id, created_by)
     values (tests.id('Settle trip'), tests.id('alice'), tests.id('bob'), 1400,
             tests.id('bob paid'), tests.id('alice')) $$,
  '23505', null,
  'a settlement is voided at most once'
);
select throws_ok(
  $$ insert into public.settlements (trip_id, from_id, to_id, amount, reverses_id, created_by)
     values (tests.id('Settle trip'), tests.id('bob'), tests.id('alice'), 1400,
             tests.id('bob paid void'), tests.id('alice')) $$,
  '23514', null,
  'a void cannot be voided'
);
select throws_ok(
  $$ insert into public.settlements (trip_id, from_id, to_id, amount, created_by)
     values (tests.id('Settle trip'), tests.id('alice'), tests.id('alice'), 100, tests.id('alice')) $$,
  '23514', null,
  'the two parties differ'
);
select throws_ok(
  $$ insert into public.settlements (trip_id, from_id, to_id, amount, created_by)
     values (tests.id('Settle trip'), tests.id('bob'), tests.id('alice'), 0, tests.id('alice')) $$,
  '23514', null,
  'an amount is at least one minor unit'
);

-- ----------------------------------------------------------------------------
-- S7: nobody leaves with a balance
-- ----------------------------------------------------------------------------

select tests.authenticate_as('alice');
select is(public.void_settlement(tests.id('carol paid')),
  'ok', 'S7 setup: void C''s standing payment');

reset role;
select tests.authenticate_as('bob');
select is(public.void_settlement(tests.id('bob paid again')),
  'ok', 'S7 setup: void B''s standing payment, which the payer can do too');
select bag_eq(
  $$ select member, net, is_member from tests.balances('Settle trip') $$,
  $$ values ('alice'::text, 4800::bigint, true), ('bob', -1400, true),
            ('carol', -3400, true), ('dave', 0, true) $$,
  'S7 setup: B owes $14.00 and C owes $34.00 again'
);

reset role;
select tests.authenticate_as('carol');
select is(public.leave_trip(tests.id('Settle trip')),
  'unsettled_balance', 'S7 step 1: C cannot leave while owing money');

reset role;
select tests.authenticate_as('alice');
select is(public.remove_trip_member(tests.id('Settle trip'), tests.id('bob')),
  'unsettled_balance', 'S7 step 2: A cannot remove B, who owes money');
select is(public.delete_trip(tests.id('Settle trip')),
  'unsettled_balance', 'S7-N4: A cannot delete the trip while anyone has a balance');

reset role;
select tests.clear_auth();
select results_eq(
  $$ select (select count(*)::int from public.trip_members where trip_id = tests.id('Settle trip')),
            (select count(*)::int from public.trips where id = tests.id('Settle trip')) $$,
  $$ values (4, 1) $$,
  'a refused departure changes nothing'
);

select tests.authenticate_as('carol');
select is(tests.record('Settle trip', 'carol', 'alice', 5000),
  'ok', 'carol overpays, and is now owed $16.00');
select is(public.leave_trip(tests.id('Settle trip')),
  'unsettled_balance', 'someone who is owed money cannot leave either');

reset role;
select tests.clear_auth();
insert into tests.ids (name, id)
select 'carol overpaid', s.id from public.settlements s
where s.trip_id = tests.id('Settle trip') and s.amount = 5000;

select tests.authenticate_as('carol');
select is(public.void_settlement(tests.id('carol overpaid')),
  'ok', 'carol voids it, and owes $34.00 again');

select is(tests.record('Settle trip', 'carol', 'alice', 3400),
  'ok', 'S7 step 3: C marks the $34.00 to A as paid');
select is(public.leave_trip(tests.id('Settle trip')),
  'ok', 'S7 step 3: at a zero balance, C can leave');

select is(
  (select count(*)::int from public.trip_balances(tests.id('Settle trip'))),
  0,
  'S7 step 4: C reads no balances for the trip after leaving'
);
select is(
  (select count(*)::int from public.settlements where trip_id = tests.id('Settle trip')),
  0,
  'or any of its settlements, including their own'
);
select is_empty(
  $$ select * from public.get_trip(tests.id('Settle trip')) $$,
  'S7 step 4: the trip is not found'
);

reset role;
select tests.authenticate_as('alice');
select is(public.remove_trip_member(tests.id('Settle trip'), tests.id('dave')),
  'ok', 'S7 step 5: A removes D, whose balance is $0.00');
select bag_eq(
  $$ select member, net, is_member from tests.balances('Settle trip') $$,
  $$ values ('alice'::text, 1400::bigint, true), ('bob', -1400, true) $$,
  'S7 step 5: the other balances do not change, and those who left settled show no row'
);
select is(
  (select sum(net)::bigint from public.trip_balances(tests.id('Settle trip'))),
  0::bigint,
  'S7-N2: balances still sum to zero'
);

-- Once a party has left, nothing moves their balance.
reset role;
select tests.clear_auth();
insert into tests.ids (name, id)
select 'carol paid again', s.id from public.settlements s
where s.trip_id = tests.id('Settle trip')
  and s.from_id = tests.id('carol') and s.reverses_id is null
  and not exists (select 1 from public.settlements v where v.reverses_id = s.id);

select tests.authenticate_as('alice');
select is(public.void_settlement(tests.id('carol paid again')),
  'member_left', 'a settlement can no longer be voided once a party has left the trip');
select is(tests.record('Settle trip', 'alice', 'carol', 100),
  'not_a_member', 'someone who left cannot be paid');

reset role;
select tests.authenticate_as('bob');
select is(tests.record('Settle trip', 'carol', 'bob', 100),
  'not_a_member', 'or be recorded as paying');

-- A deleted expense no longer counts toward the rule.
reset role;
select tests.clear_auth();
select tests.create_trip('alice', 'Undo trip');
insert into public.trip_members (trip_id, profile_id, role)
values (tests.id('Undo trip'), tests.id('bob'), 'member');

select tests.authenticate_as('bob');
select is(
  (select status from public.create_expense(
     tests.id('Undo trip'), tests.id('bob'), 'Mistake', 1000, 'equal',
     array[tests.id('alice'), tests.id('bob')])),
  'ok', 'setup: bob adds an expense');
select is(public.leave_trip(tests.id('Undo trip')),
  'unsettled_balance', 'bob is owed $5.00 and cannot leave');

reset role;
select tests.clear_auth();
insert into tests.ids (name, id)
select 'Mistake', e.id from public.expenses e where e.trip_id = tests.id('Undo trip');

select tests.authenticate_as('bob');
select is(public.delete_expense(tests.id('Mistake')),
  'ok', 'bob deletes the expense');
select is(public.leave_trip(tests.id('Undo trip')),
  'ok', 'a deleted expense no longer counts, so bob can leave');

-- At zero, the organizer can delete the trip, settlements and voids included.
reset role;
select tests.authenticate_as('bob');
select is(tests.record('Settle trip', 'bob', 'alice', 1400),
  'ok', 'bob pays alice the last $14.00');

reset role;
select tests.authenticate_as('alice');
select is(public.delete_trip(tests.id('Settle trip')),
  'ok', 'with every balance at zero, the organizer can delete the trip');

reset role;
select tests.clear_auth();
select is(
  (select count(*)::int from public.settlements where trip_id = tests.id('Settle trip')),
  0,
  'deleting a trip removes its settlements and voids'
);

-- ----------------------------------------------------------------------------
-- Money-privacy matrix: on a private, an unlisted and a public trip, nobody
-- outside the trip reads a settlement or a balance, whatever their ties to its
-- members.
-- ----------------------------------------------------------------------------

select tests.create_trip('alice', 'Private settle', 'private');
select tests.create_trip('alice', 'Unlisted settle', 'unlisted');
select tests.create_trip('alice', 'Public settle', 'public');
insert into public.trip_members (trip_id, profile_id, role)
select tests.id(t.name), tests.id(m.name), 'member'
from (values ('Private settle'), ('Unlisted settle'), ('Public settle')) as t(name)
cross join (values ('bob'), ('lena')) as m(name);

insert into public.follows (follower_id, followee_id) values
  (tests.id('fran'), tests.id('alice')),
  (tests.id('fran'), tests.id('bob'));
select tests.create_trip('cody', 'Cody trip');
insert into public.trip_members (trip_id, profile_id, role) values
  (tests.id('Cody trip'), tests.id('alice'), 'member'),
  (tests.id('Cody trip'), tests.id('bob'), 'member');

-- What the caller can read of each matrix trip's settlements and balances.
create function tests.visible_settlement_money()
returns table (trip text, surface text, visible int)
language sql
stable
as $$
  select lower(split_part(t.name, ' ', 1)), m.surface,
         case m.surface
           when 'settlements' then
             (select count(*)::int from public.settlements s where s.trip_id = tests.id(t.name))
           else
             (select count(*)::int from public.trip_balances(tests.id(t.name)))
         end
  from (values ('Private settle'), ('Unlisted settle'), ('Public settle')) as t(name)
  cross join (values ('settlements'), ('trip_balances')) as m(surface);
$$;
grant execute on function tests.visible_settlement_money() to authenticated;

select tests.authenticate_as('alice');
select is(
  (select status from public.create_expense(
     tests.id(t.name), tests.id('alice'), 'Deposit', 5000, 'equal',
     array[tests.id('alice'), tests.id('bob')])),
  'ok',
  format('setup: alice adds an expense to the %s trip', lower(split_part(t.name, ' ', 1)))
)
from (values ('Private settle'), ('Unlisted settle'), ('Public settle')) as t(name);

reset role;
select tests.authenticate_as('bob');
select is(tests.record(t.name, 'bob', 'alice', 1000), 'ok',
  format('setup: bob pays part of it on the %s trip', lower(split_part(t.name, ' ', 1))))
from (values ('Private settle'), ('Unlisted settle'), ('Public settle')) as t(name);

reset role;
select tests.authenticate_as('vic');
select results_eq(
  $$ select t.name, (select count(*)::int from public.get_trip(tests.id(t.name)))
     from (values ('Private settle'), ('Unlisted settle'), ('Public settle')) as t(name) $$,
  $$ values ('Private settle', 0), ('Unlisted settle', 1), ('Public settle', 1) $$,
  'the viewer can open the unlisted and public trips, not the private one'
);
select is(v.visible, 0,
  format('a viewer of the trip reads no %s on the %s trip', v.surface, v.trip))
from tests.visible_settlement_money() as v;

reset role;
select tests.authenticate_as('sam');
select is(v.visible, 0,
  format('a stranger reads no %s on the %s trip', v.surface, v.trip))
from tests.visible_settlement_money() as v;

reset role;
select tests.authenticate_as('fran');
select is(v.visible, 0,
  format('a follower of two members reads no %s on the %s trip', v.surface, v.trip))
from tests.visible_settlement_money() as v;

reset role;
select tests.authenticate_as('cody');
select is(v.visible, 0,
  format('someone in another trip with the members reads no %s on the %s trip', v.surface, v.trip))
from tests.visible_settlement_money() as v;

reset role;
select tests.authenticate_as('lena');
select is(public.leave_trip(tests.id(t.name)), 'ok',
  format('lena has no balance and leaves the %s trip', lower(split_part(t.name, ' ', 1))))
from (values ('Private settle'), ('Unlisted settle'), ('Public settle')) as t(name);
select is(v.visible, 0,
  format('someone who left reads no %s on the %s trip', v.surface, v.trip))
from tests.visible_settlement_money() as v;

reset role;
select tests.authenticate_as('bob');
select is(v.visible, case v.surface when 'settlements' then 1 else 2 end,
  format('a member reads every row of %s on the %s trip', v.surface, v.trip))
from tests.visible_settlement_money() as v;

reset role;
select tests.authenticate_as_anon();
select throws_ok(
  $$ select count(*) from public.settlements $$,
  '42501', null,
  'anon cannot read settlements at all'
);
select throws_ok(
  $$ select count(*) from public.trip_balances(tests.id('Public settle')) $$,
  '42501', null,
  'anon cannot read balances at all'
);

-- Section 12, Q5: a block between two members doesn't hide their money from
-- each other inside the trip.
reset role;
select tests.clear_auth();
insert into public.blocks (blocker_id, blocked_id) values (tests.id('alice'), tests.id('bob'));

select tests.authenticate_as('bob');
select is(
  (select count(*)::int from public.settlements
   where trip_id = tests.id('Private settle') and to_id = tests.id('alice')),
  1,
  'a member blocked by the other party still reads the settlement'
);
select is(
  (select net from public.trip_balances(tests.id('Private settle'))
   where member_id = tests.id('alice')),
  1500::bigint,
  'and their balance'
);
select is(tests.record('Private settle', 'bob', 'alice', 100),
  'ok', 'and can still settle up with them');

-- ----------------------------------------------------------------------------
-- Someone who left owing money before this rule existed
-- ----------------------------------------------------------------------------

reset role;
select tests.clear_auth();
select tests.create_trip('alice', 'Legacy trip');
insert into public.trip_members (trip_id, profile_id, role)
values (tests.id('Legacy trip'), tests.id('bob'), 'member');

select tests.authenticate_as('alice');
select is(
  (select status from public.create_expense(
     tests.id('Legacy trip'), tests.id('alice'), 'Old cost', 1000, 'equal',
     array[tests.id('alice'), tests.id('bob')])),
  'ok', 'setup: alice adds an expense shared with bob');

reset role;
select tests.clear_auth();
delete from public.trip_members
where trip_id = tests.id('Legacy trip') and profile_id = tests.id('bob');

select tests.authenticate_as('alice');
select bag_eq(
  $$ select member, net, is_member from tests.balances('Legacy trip') $$,
  $$ values ('alice'::text, 500::bigint, true), ('bob', -500, false) $$,
  'someone who left with a balance still shows, marked as gone'
);
select is(
  (select sum(net)::bigint from public.trip_balances(tests.id('Legacy trip'))),
  0::bigint,
  'so a trip''s rows always sum to zero'
);

-- ----------------------------------------------------------------------------
-- The trip's currency
-- ----------------------------------------------------------------------------

reset role;
select tests.clear_auth();
select tests.create_trip('alice', 'Currency trip');
insert into public.trip_members (trip_id, profile_id, role)
values (tests.id('Currency trip'), tests.id('bob'), 'member');

select tests.authenticate_as('bob');
select is(tests.record('Currency trip', 'bob', 'alice', 100),
  'ok', 'setup: a settlement on a trip with no expenses');

reset role;
select tests.clear_auth();
select throws_ok(
  $$ update public.trips set currency = 'EUR' where id = tests.id('Currency trip') $$,
  '23514', null,
  'a trip''s currency cannot change once it has a settlement'
);

-- ----------------------------------------------------------------------------
-- Rate limits
-- ----------------------------------------------------------------------------

update private.rate_limit_rules set max_count = 1 where surface = 'settlement_write';
select tests.create_trip('frank', 'Frank trip');
insert into public.trip_members (trip_id, profile_id, role)
values (tests.id('Frank trip'), tests.id('gus'), 'member');

select tests.authenticate_as('frank');
select is(tests.record('Frank trip', 'frank', 'gus', 100),
  'ok', 'the first settlement in the window is recorded');
select is(tests.record('Frank trip', 'frank', 'gus', 100),
  'rate_limited', 'recording past the limit is refused');

reset role;
select tests.clear_auth();
insert into tests.ids (name, id)
select 'frank paid', s.id from public.settlements s where s.trip_id = tests.id('Frank trip');

select tests.authenticate_as('frank');
select is(public.void_settlement(tests.id('frank paid')),
  'rate_limited', 'voids share the limit');

reset role;
select tests.clear_auth();
select is(
  (select count(*)::int from public.settlements where trip_id = tests.id('Frank trip')),
  1,
  'refused writes change nothing'
);

select * from finish();
rollback;
