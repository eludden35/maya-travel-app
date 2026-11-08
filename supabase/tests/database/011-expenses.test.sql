-- tripplanner-2o5.2: expenses and their shares. Every write goes through
-- create_expense, update_expense or delete_expense, and only the trip's
-- members read the rows, whatever the trip's visibility. Founder decisions
-- (test plan section 12, 2026-11-03): the payer, the member who added an
-- expense or the organizer may edit or delete it; a delete is soft; an
-- expense freezes once someone on it has left the trip.
begin;
select plan(142);

select tests.create_user('alice');  -- organizer
select tests.create_user('bob');    -- member
select tests.create_user('carol');  -- member; leaves partway through
select tests.create_user('dave');   -- stranger
select tests.create_user('fran');   -- follows alice and bob
select tests.create_user('vic');    -- opens the unlisted and public trips by id
select tests.create_user('cody');   -- shares another trip with alice and bob
select tests.create_user('frank');  -- rate limits

select tests.create_trip('alice', 'Ledger trip');
insert into public.trip_members (trip_id, profile_id, role) values
  (tests.id('Ledger trip'), tests.id('bob'), 'member'),
  (tests.id('Ledger trip'), tests.id('carol'), 'member');

-- ----------------------------------------------------------------------------
-- Who may call, read and write
-- ----------------------------------------------------------------------------

select is_empty(
  $$ select f
     from unnest(array[
       'public.create_expense(uuid, uuid, text, bigint, public.expense_split, uuid[], bigint[])',
       'public.update_expense(uuid, uuid, text, bigint, public.expense_split, uuid[], bigint[])',
       'public.delete_expense(uuid)'
     ]) as f
     where has_function_privilege('anon', f, 'execute') $$,
  'anon cannot call any expense RPC'
);
select ok(
  (select bool_and(has_function_privilege('authenticated', f, 'execute'))
   from unnest(array[
     'public.create_expense(uuid, uuid, text, bigint, public.expense_split, uuid[], bigint[])',
     'public.update_expense(uuid, uuid, text, bigint, public.expense_split, uuid[], bigint[])',
     'public.delete_expense(uuid)'
   ]) as f),
  'signed-in users can call the expense RPCs'
);
select ok(
  not has_table_privilege('anon', 'public.expenses', 'select, insert, update, delete, truncate, references, trigger')
  and not has_table_privilege('anon', 'public.expense_shares', 'select, insert, update, delete, truncate, references, trigger'),
  'anon has no privilege on the money tables'
);
select ok(
  has_table_privilege('authenticated', 'public.expenses', 'select')
  and has_table_privilege('authenticated', 'public.expense_shares', 'select')
  and not has_table_privilege('authenticated', 'public.expenses', 'insert, update, delete, truncate, references, trigger')
  and not has_table_privilege('authenticated', 'public.expense_shares', 'insert, update, delete, truncate, references, trigger'),
  'signed-in users can only read the money tables'
);
select is(
  (select string_agg(p.tablename || ' ' || p.cmd || ' ' || array_to_string(p.roles, ','), '; '
                     order by p.tablename)
   from pg_policies p
   where p.schemaname = 'public' and p.tablename in ('expenses', 'expense_shares')),
  'expense_shares SELECT authenticated; expenses SELECT authenticated',
  'each money table has one policy: SELECT, for signed-in users'
);
select is_empty(
  $$ select policyname
     from pg_policies
     where schemaname = 'public' and tablename in ('expenses', 'expense_shares')
       and qual ~* 'visibility|follow|shares_trip_with|block' $$,
  'no money policy looks at visibility, follows, shared trips or blocks'
);

select tests.clear_auth();
select set_config('role', 'authenticated', true);
select is(
  (select status from public.create_expense(
     tests.id('Ledger trip'), tests.id('alice'), 'Ghost', 100, 'equal', array[tests.id('alice')])),
  'unauthorized',
  'a caller with no user id is refused'
);

-- ----------------------------------------------------------------------------
-- Equal splits (S4 steps 1-2, S4-N2)
-- ----------------------------------------------------------------------------

reset role;
select tests.authenticate_as('alice');
select is(
  (select status from public.create_expense(
     tests.id('Ledger trip'), tests.id('alice'), '  Hotel deposit  ', 10000, 'equal',
     array[tests.id('carol'), tests.id('alice'), tests.id('bob')])),
  'ok',
  'a member adds an expense split equally'
);
select is(
  (select status from public.create_expense(
     tests.id('Ledger trip'), tests.id('alice'), 'Hotel deposit again', 10000, 'equal',
     array[tests.id('bob'), tests.id('alice'), tests.id('carol')])),
  'ok',
  'the same expense again, with the members in another order'
);
select is(
  (select status from public.create_expense(
     tests.id('Ledger trip'), tests.id('alice'), 'Two cents', 2, 'equal',
     array[tests.id('alice'), tests.id('bob'), tests.id('carol')])),
  'ok',
  'two cents split three ways'
);
select is(
  (select status from public.create_expense(
     tests.id('Ledger trip'), tests.id('bob'), 'Taxi', 1001, 'equal',
     array[tests.id('alice'), tests.id('carol')])),
  'ok',
  'a member records that another member paid, for a split they are not in'
);

reset role;
select tests.clear_auth();
insert into tests.ids (name, id)
select e.description, e.id from public.expenses e where e.trip_id = tests.id('Ledger trip');

select results_eq(
  $$ select payer_id, description, amount, split::text, created_by, updated_by, deleted_at
     from public.expenses where id = tests.id('Hotel deposit') $$,
  $$ values (tests.id('alice'), 'Hotel deposit', 10000::bigint, 'equal', tests.id('alice'),
             null::uuid, null::timestamptz) $$,
  'the expense keeps its payer, trimmed description, amount, split and who added it'
);
select bag_eq(
  $$ select member_id, amount from public.expense_shares where expense_id = tests.id('Hotel deposit') $$,
  $$ values (tests.id('alice'), 3334::bigint), (tests.id('bob'), 3333::bigint),
            (tests.id('carol'), 3333::bigint) $$,
  'S4 step 1: $100.00 three ways is $33.34 for the payer and $33.33 for the others'
);
select bag_eq(
  $$ select member_id, amount from public.expense_shares where expense_id = tests.id('Hotel deposit again') $$,
  $$ select member_id, amount from public.expense_shares where expense_id = tests.id('Hotel deposit') $$,
  'S4 step 2: the same input gives the same shares, whatever order the members come in'
);
select bag_eq(
  $$ select member_id, amount from public.expense_shares where expense_id = tests.id('Two cents') $$,
  $$ values (tests.id('alice'), 1::bigint),
            (least(tests.id('bob'), tests.id('carol')), 1::bigint),
            (greatest(tests.id('bob'), tests.id('carol')), 0::bigint) $$,
  'S4-N2: the payer gets the first odd cent and the lower id the second; a zero share is kept'
);
select bag_eq(
  $$ select member_id, amount from public.expense_shares where expense_id = tests.id('Taxi') $$,
  $$ values (least(tests.id('alice'), tests.id('carol')), 501::bigint),
            (greatest(tests.id('alice'), tests.id('carol')), 500::bigint) $$,
  'a payer outside the split has no share, and the odd cent goes to the lower id'
);
select is(
  (select coalesce(sum(count), 0)::int from public.rate_limit_counters
   where profile_id = tests.id('alice') and surface = 'expense_write'),
  4,
  'each new expense charges expense_write'
);

-- ----------------------------------------------------------------------------
-- Exact splits (S4 steps 4-6, S4-N3)
-- ----------------------------------------------------------------------------

select tests.authenticate_as('bob');
select is(
  (select status from public.create_expense(
     tests.id('Ledger trip'), tests.id('bob'), 'Dinner', 9000, 'exact',
     array[tests.id('alice'), tests.id('bob'), tests.id('carol')], array[3000, 3000, 2000]::bigint[])),
  'shares_mismatch',
  'S4 step 4: exact shares $10.00 short of the amount are refused'
);
select is(
  (select status from public.create_expense(
     tests.id('Ledger trip'), tests.id('bob'), 'Dinner', 9000, 'exact',
     array[tests.id('alice'), tests.id('bob'), tests.id('carol')], array[3000, 3000, 4000]::bigint[])),
  'shares_mismatch',
  'S4 step 5: exact shares $10.00 over the amount are refused'
);
select is(
  (select status from public.create_expense(
     tests.id('Ledger trip'), tests.id('bob'), 'Dinner', 9000, 'exact',
     array[tests.id('alice'), tests.id('bob'), tests.id('carol')], array[3000, 3000, 3000]::bigint[])),
  'ok',
  'S4 step 6: exact shares that add up are saved'
);
select is(
  (select status from public.create_expense(
     tests.id('Ledger trip'), tests.id('bob'), 'Villa', 99999999999, 'exact',
     array[tests.id('bob'), tests.id('carol')], array[99999999999, 0]::bigint[])),
  'ok',
  'S4-N3: the largest amount, 999,999,999.99, is accepted, and a share can be zero'
);

reset role;
select tests.clear_auth();
insert into tests.ids (name, id)
select e.description, e.id from public.expenses e
where e.trip_id = tests.id('Ledger trip') and e.description in ('Dinner', 'Villa');

select bag_eq(
  $$ select member_id, amount from public.expense_shares where expense_id = tests.id('Dinner') $$,
  $$ values (tests.id('alice'), 3000::bigint), (tests.id('bob'), 3000::bigint),
            (tests.id('carol'), 3000::bigint) $$,
  'exact shares are stored as entered'
);

-- ----------------------------------------------------------------------------
-- Bad input is refused before the rate-limit charge and writes nothing
-- ----------------------------------------------------------------------------

select tests.authenticate_as('alice');
select is((select status from public.create_expense(tests.id('Ledger trip'), tests.id('alice'),
    '   ', 100, 'equal', array[tests.id('alice')])),
  'invalid_description', 'a blank description is refused');
select is((select status from public.create_expense(tests.id('Ledger trip'), tests.id('alice'),
    repeat('x', 121), 100, 'equal', array[tests.id('alice')])),
  'invalid_description', 'a description over 120 characters is refused');
select is((select status from public.create_expense(tests.id('Ledger trip'), tests.id('alice'),
    E'Two\nlines', 100, 'equal', array[tests.id('alice')])),
  'invalid_description', 'a description must be one line');
select is((select status from public.create_expense(tests.id('Ledger trip'), tests.id('alice'),
    'Nothing', 0, 'equal', array[tests.id('alice')])),
  'invalid_amount', 'S4-N1: an amount of zero is refused');
select is((select status from public.create_expense(tests.id('Ledger trip'), tests.id('alice'),
    'Refund', -100, 'equal', array[tests.id('alice')])),
  'invalid_amount', 'S4-N1: a negative amount is refused');
select is((select status from public.create_expense(tests.id('Ledger trip'), tests.id('alice'),
    'Yacht', 100000000000, 'equal', array[tests.id('alice')])),
  'invalid_amount', 'an amount over 999,999,999.99 is refused');
select is((select status from public.create_expense(tests.id('Ledger trip'), tests.id('alice'),
    'Unpriced', null, 'equal', array[tests.id('alice')])),
  'invalid_amount', 'an amount is required');
select is((select status from public.create_expense(tests.id('Ledger trip'), tests.id('alice'),
    'Nobody', 100, 'equal', array[]::uuid[])),
  'invalid_shares', 'a split needs at least one member');
select is((select status from public.create_expense(tests.id('Ledger trip'), tests.id('alice'),
    'Nobody', 100, 'equal', null)),
  'invalid_shares', 'a split needs its member list');
select is((select status from public.create_expense(tests.id('Ledger trip'), tests.id('alice'),
    'Twice', 100, 'equal', array[tests.id('alice'), tests.id('alice')])),
  'invalid_shares', 'a member can be in a split only once');
select is((select status from public.create_expense(tests.id('Ledger trip'), tests.id('alice'),
    'Gap', 100, 'equal', array[tests.id('alice'), null])),
  'invalid_shares', 'a member id cannot be null');
select is((select status from public.create_expense(tests.id('Ledger trip'), tests.id('alice'),
    'Grid', 100, 'equal', array[array[tests.id('alice'), tests.id('bob')]])),
  'invalid_shares', 'the member list must be flat');
select is((select status from public.create_expense(tests.id('Ledger trip'), tests.id('alice'),
    'Mixed', 100, 'equal', array[tests.id('alice'), tests.id('bob')], array[50, 50]::bigint[])),
  'invalid_shares', 'an equal split takes no amounts');
select is((select status from public.create_expense(tests.id('Ledger trip'), tests.id('alice'),
    'Unsplit', 100, 'exact', array[tests.id('alice'), tests.id('bob')])),
  'invalid_shares', 'an exact split needs the amounts');
select is((select status from public.create_expense(tests.id('Ledger trip'), tests.id('alice'),
    'Short list', 100, 'exact', array[tests.id('alice'), tests.id('bob')], array[100]::bigint[])),
  'invalid_shares', 'an exact split needs one amount per member');
select is((select status from public.create_expense(tests.id('Ledger trip'), tests.id('alice'),
    'Credit', 100, 'exact', array[tests.id('alice'), tests.id('bob')], array[150, -50]::bigint[])),
  'invalid_shares', 'a share cannot be negative');
select is((select status from public.create_expense(tests.id('Ledger trip'), tests.id('alice'),
    'No method', 100, null, array[tests.id('alice')])),
  'invalid_shares', 'a split method is required');
select is((select status from public.create_expense(tests.id('Ledger trip'), tests.id('dave'),
    'Outsider paid', 100, 'equal', array[tests.id('alice')])),
  'not_a_member', 'the payer must be in the trip');
select is((select status from public.create_expense(tests.id('Ledger trip'), tests.id('alice'),
    'Outsider owes', 100, 'equal', array[tests.id('alice'), tests.id('dave')])),
  'not_a_member', 'everyone in the split must be in the trip');
select is((select status from public.create_expense(tests.id('Ledger trip'), null,
    'Nobody paid', 100, 'equal', array[tests.id('alice')])),
  'not_a_member', 'a payer is required');

reset role;
select tests.clear_auth();
select is(
  (select count(*)::int from public.expenses where trip_id = tests.id('Ledger trip')),
  6,
  'refused expenses write nothing'
);
select is(
  (select coalesce(sum(count), 0)::int from public.rate_limit_counters
   where profile_id = tests.id('alice') and surface = 'expense_write'),
  4,
  'refused input does not use up the rate limit'
);

-- ----------------------------------------------------------------------------
-- Direct writes are refused, even for members
-- ----------------------------------------------------------------------------

select tests.authenticate_as('alice');
select throws_ok(
  $$ insert into public.expenses (trip_id, payer_id, description, amount, split)
     values (tests.id('Ledger trip'), tests.id('alice'), 'Sneaky', 100, 'equal') $$,
  '42501', null,
  'members cannot insert expenses directly'
);
select throws_ok(
  $$ update public.expenses set amount = 1 where id = tests.id('Hotel deposit') $$,
  '42501', null,
  'members cannot update expenses directly'
);
select throws_ok(
  $$ delete from public.expenses where id = tests.id('Hotel deposit') $$,
  '42501', null,
  'members cannot delete expenses directly'
);
select throws_ok(
  $$ insert into public.expense_shares (expense_id, trip_id, member_id, amount)
     values (tests.id('Hotel deposit'), tests.id('Ledger trip'), tests.id('alice'), 1) $$,
  '42501', null,
  'members cannot insert shares directly'
);
select throws_ok(
  $$ update public.expense_shares set amount = 0 where expense_id = tests.id('Hotel deposit') $$,
  '42501', null,
  'members cannot update shares directly'
);
select throws_ok(
  $$ delete from public.expense_shares where expense_id = tests.id('Hotel deposit') $$,
  '42501', null,
  'members cannot delete shares directly'
);

-- ----------------------------------------------------------------------------
-- Outside the trip, everything is not_found
-- ----------------------------------------------------------------------------

reset role;
select tests.authenticate_as('dave');
select is(
  (select status from public.create_expense(
     tests.id('Ledger trip'), tests.id('dave'), 'Mine', 100, 'equal', array[tests.id('dave')])),
  'not_found',
  'a stranger cannot add an expense to the trip'
);
select is(
  public.update_expense(tests.id('Hotel deposit'), tests.id('dave'), 'Mine', 100, 'equal',
    array[tests.id('dave')]),
  'not_found',
  'a stranger cannot edit an expense'
);
select is(public.delete_expense(tests.id('Hotel deposit')),
  'not_found', 'a stranger cannot delete an expense');
select is(public.delete_expense(gen_random_uuid()),
  'not_found', 'an expense that does not exist is not found');

reset role;
select tests.authenticate_as('alice');
select is(
  (select status from public.create_expense(
     gen_random_uuid(), tests.id('alice'), 'Lost', 100, 'equal', array[tests.id('alice')])),
  'not_found',
  'a trip that does not exist is not found'
);

-- ----------------------------------------------------------------------------
-- Editing (section 12, Q1: the payer, who added it, or the organizer)
-- ----------------------------------------------------------------------------

reset role;
select tests.authenticate_as('bob');
select is(
  public.update_expense(tests.id('Hotel deposit'), tests.id('bob'), 'Mine now', 10000, 'equal',
    array[tests.id('bob')]),
  'forbidden',
  'a member who neither paid nor added the expense cannot edit it'
);
select is(public.delete_expense(tests.id('Hotel deposit')),
  'forbidden', 'or delete it');

reset role;
select tests.authenticate_as('alice');
select is(
  public.update_expense(tests.id('Hotel deposit'), tests.id('alice'), 'Hotel deposit', 12000, 'equal',
    array[tests.id('alice'), tests.id('bob'), tests.id('carol')]),
  'ok',
  'S4 step 7: the payer edits the amount'
);

reset role;
select tests.clear_auth();
select bag_eq(
  $$ select member_id, amount from public.expense_shares where expense_id = tests.id('Hotel deposit') $$,
  $$ values (tests.id('alice'), 4000::bigint), (tests.id('bob'), 4000::bigint),
            (tests.id('carol'), 4000::bigint) $$,
  'S4 step 7: $120.00 three ways is $40.00 each'
);
select results_eq(
  $$ select amount, created_by, updated_by from public.expenses where id = tests.id('Hotel deposit') $$,
  $$ values (12000::bigint, tests.id('alice'), tests.id('alice')) $$,
  'an edit records who made it and keeps who added the expense'
);

select tests.authenticate_as('carol');
select is(
  (select status from public.create_expense(
     tests.id('Ledger trip'), tests.id('bob'), 'Groceries', 3000, 'equal',
     array[tests.id('bob'), tests.id('carol')])),
  'ok',
  'carol adds an expense that bob paid'
);

reset role;
select tests.clear_auth();
insert into tests.ids (name, id)
select 'Groceries', e.id from public.expenses e where e.description = 'Groceries';

select tests.authenticate_as('carol');
select is(
  public.update_expense(tests.id('Groceries'), tests.id('bob'), 'Groceries and wine', 4500, 'exact',
    array[tests.id('bob'), tests.id('carol')], array[1500, 3000]::bigint[]),
  'ok',
  'the member who added an expense can edit it'
);

reset role;
select tests.authenticate_as('bob');
select is(
  public.update_expense(tests.id('Groceries'), tests.id('bob'), 'Groceries and wine', 4500, 'equal',
    array[tests.id('bob'), tests.id('carol')]),
  'ok',
  'the payer can edit it'
);

reset role;
select tests.authenticate_as('carol');
select is(
  public.update_expense(tests.id('Dinner'), tests.id('carol'), 'Dinner', 9000, 'equal',
    array[tests.id('carol')]),
  'forbidden',
  'carol cannot edit the dinner bob paid for and added'
);

reset role;
select tests.authenticate_as('alice');
select is(
  public.update_expense(tests.id('Dinner'), tests.id('alice'), 'Dinner', 9000, 'exact',
    array[tests.id('alice'), tests.id('bob')], array[4000, 5000]::bigint[]),
  'ok',
  'the organizer can edit any expense, including its payer and split'
);

reset role;
select tests.clear_auth();
select bag_eq(
  $$ select member_id, amount from public.expense_shares where expense_id = tests.id('Dinner') $$,
  $$ values (tests.id('alice'), 4000::bigint), (tests.id('bob'), 5000::bigint) $$,
  'an edit replaces every share'
);
select results_eq(
  $$ select payer_id, split::text, created_by, updated_by from public.expenses where id = tests.id('Dinner') $$,
  $$ values (tests.id('alice'), 'exact', tests.id('bob'), tests.id('alice')) $$,
  'an edit can change the payer and split'
);

select tests.authenticate_as('alice');
select is(
  public.update_expense(tests.id('Hotel deposit'), tests.id('alice'), 'Hotel deposit', 0, 'equal',
    array[tests.id('alice')]),
  'invalid_amount',
  'edits are validated too'
);
select is(
  public.update_expense(tests.id('Hotel deposit'), tests.id('alice'), 'Hotel deposit', 12000, 'equal',
    array[tests.id('alice'), tests.id('dave')]),
  'not_a_member',
  'an edit cannot bring in someone outside the trip'
);

reset role;
select tests.clear_auth();
select results_eq(
  $$ select e.amount, count(s.*)::int
     from public.expenses e join public.expense_shares s on s.expense_id = e.id
     where e.id = tests.id('Hotel deposit')
     group by e.amount $$,
  $$ values (12000::bigint, 3) $$,
  'a refused edit changes nothing'
);

-- ----------------------------------------------------------------------------
-- Deleting (section 12, Q1: a soft delete; S4 step 3)
-- ----------------------------------------------------------------------------

select tests.authenticate_as('alice');
select is(public.delete_expense(tests.id('Hotel deposit again')),
  'ok', 'S4 step 3: the payer deletes an expense');

reset role;
select tests.authenticate_as('bob');
select is(
  (select count(*)::int from public.expenses where id = tests.id('Hotel deposit again')),
  0,
  'a deleted expense is gone for every member'
);
select is(
  (select count(*)::int from public.expense_shares where expense_id = tests.id('Hotel deposit again')),
  0,
  'and so are its shares'
);

reset role;
select tests.clear_auth();
select ok(
  (select deleted_by = tests.id('alice') and deleted_at is not null
   from public.expenses where id = tests.id('Hotel deposit again')),
  'the deleted row stays, with who deleted it and when'
);
select is(
  (select count(*)::int from public.expense_shares where expense_id = tests.id('Hotel deposit again')),
  3,
  'its shares stay too, so the founder can restore it'
);

select tests.authenticate_as('alice');
select is(public.delete_expense(tests.id('Hotel deposit again')),
  'not_found', 'deleting twice finds nothing to delete');
select is(
  public.update_expense(tests.id('Hotel deposit again'), tests.id('alice'), 'Back', 10000, 'equal',
    array[tests.id('alice')]),
  'not_found',
  'a deleted expense cannot be edited'
);

reset role;
select tests.authenticate_as('bob');
select is(public.delete_expense(tests.id('Taxi')),
  'ok', 'the payer can delete an expense someone else added');

-- ----------------------------------------------------------------------------
-- Once someone on an expense leaves the trip, it freezes
-- ----------------------------------------------------------------------------

reset role;
select tests.authenticate_as('carol');
select is(
  (select status from public.record_settlement(
     tests.id('Ledger trip'), tests.id('carol'), tests.id('alice'),
     -(select b.net from public.trip_balances(tests.id('Ledger trip')) as b
       where b.member_id = tests.id('carol')))),
  'ok',
  'carol settles up, since nobody leaves with a balance (tripplanner-2o5.3)'
);
select is(public.leave_trip(tests.id('Ledger trip')), 'ok', 'carol leaves the trip');
select is(
  (select count(*)::int from public.expenses where trip_id = tests.id('Ledger trip')),
  0,
  'a member who left reads none of the trip''s expenses'
);
select is(
  (select count(*)::int from public.expense_shares where trip_id = tests.id('Ledger trip')),
  0,
  'or their shares, including their own'
);

reset role;
select tests.authenticate_as('alice');
select is(
  public.update_expense(tests.id('Hotel deposit'), tests.id('alice'), 'Hotel deposit', 9000, 'equal',
    array[tests.id('alice'), tests.id('bob')]),
  'member_left',
  'an expense with a share held by someone who left cannot be edited'
);
select is(public.delete_expense(tests.id('Hotel deposit')),
  'member_left', 'or deleted');
select is(
  (select status from public.create_expense(
     tests.id('Ledger trip'), tests.id('alice'), 'Late lunch', 3000, 'equal',
     array[tests.id('alice'), tests.id('carol')])),
  'not_a_member',
  'someone who left cannot be put in a new split'
);
select is(
  (select status from public.create_expense(
     tests.id('Ledger trip'), tests.id('carol'), 'Late lunch', 3000, 'equal',
     array[tests.id('alice')])),
  'not_a_member',
  'or be its payer'
);
select is(
  public.update_expense(tests.id('Dinner'), tests.id('alice'), 'Dinner', 9000, 'equal',
    array[tests.id('alice'), tests.id('bob')]),
  'ok',
  'an expense that only current members are on can still be edited'
);

reset role;
select tests.clear_auth();
select results_eq(
  $$ select e.amount, e.deleted_at, count(s.*)::int
     from public.expenses e join public.expense_shares s on s.expense_id = e.id
     where e.id = tests.id('Hotel deposit')
     group by e.amount, e.deleted_at $$,
  $$ values (12000::bigint, null::timestamptz, 3) $$,
  'a frozen expense is unchanged'
);

-- ----------------------------------------------------------------------------
-- Money-privacy matrix: on a private, an unlisted and a public trip, nobody
-- outside the trip reads a row, whatever their ties to its members.
-- ----------------------------------------------------------------------------

select tests.create_trip('alice', 'Private ledger', 'private');
select tests.create_trip('alice', 'Unlisted ledger', 'unlisted');
select tests.create_trip('alice', 'Public ledger', 'public');
insert into public.trip_members (trip_id, profile_id, role)
select tests.id(t.name), tests.id('bob'), 'member'
from (values ('Private ledger'), ('Unlisted ledger'), ('Public ledger')) as t(name);

insert into public.follows (follower_id, followee_id) values
  (tests.id('fran'), tests.id('alice')),
  (tests.id('fran'), tests.id('bob'));
select tests.create_trip('cody', 'Cody trip');
insert into public.trip_members (trip_id, profile_id, role) values
  (tests.id('Cody trip'), tests.id('alice'), 'member'),
  (tests.id('Cody trip'), tests.id('bob'), 'member');

-- What the caller can read of each matrix trip's money.
create function tests.visible_money()
returns table (trip text, money_table text, visible int)
language sql
stable
as $$
  select lower(split_part(t.name, ' ', 1)), m.money_table,
         case m.money_table
           when 'expenses' then
             (select count(*)::int from public.expenses e where e.trip_id = tests.id(t.name))
           else
             (select count(*)::int from public.expense_shares s where s.trip_id = tests.id(t.name))
         end
  from (values ('Private ledger'), ('Unlisted ledger'), ('Public ledger')) as t(name)
  cross join (values ('expenses'), ('expense_shares')) as m(money_table);
$$;
grant execute on function tests.visible_money() to authenticated;

select tests.authenticate_as('alice');
select is(
  (select status from public.create_expense(
     tests.id(t.name), tests.id('alice'), 'Deposit', 5000, 'equal',
     array[tests.id('alice'), tests.id('bob')])),
  'ok',
  format('alice adds an expense to the %s', lower(t.name))
)
from (values ('Private ledger'), ('Unlisted ledger'), ('Public ledger')) as t(name);

reset role;
select tests.authenticate_as('vic');
select results_eq(
  $$ select t.name, (select count(*)::int from public.get_trip(tests.id(t.name)))
     from (values ('Private ledger'), ('Unlisted ledger'), ('Public ledger')) as t(name) $$,
  $$ values ('Private ledger', 0), ('Unlisted ledger', 1), ('Public ledger', 1) $$,
  'the viewer can open the unlisted and public trips, not the private one'
);
select is(v.visible, 0,
  format('a viewer of the trip reads no %s on the %s trip', v.money_table, v.trip))
from tests.visible_money() as v;

reset role;
select tests.authenticate_as('dave');
select is(v.visible, 0,
  format('a stranger reads no %s on the %s trip', v.money_table, v.trip))
from tests.visible_money() as v;

reset role;
select tests.authenticate_as('fran');
select is(v.visible, 0,
  format('a follower of two members reads no %s on the %s trip', v.money_table, v.trip))
from tests.visible_money() as v;

reset role;
select tests.authenticate_as('cody');
select is(v.visible, 0,
  format('someone in another trip with the members reads no %s on the %s trip', v.money_table, v.trip))
from tests.visible_money() as v;

reset role;
select tests.authenticate_as('bob');
select is(v.visible, case v.money_table when 'expenses' then 1 else 2 end,
  format('a member reads every %s row on the %s trip', v.money_table, v.trip))
from tests.visible_money() as v;

reset role;
select tests.authenticate_as_anon();
select throws_ok(
  $$ select count(*) from public.expenses $$,
  '42501', null,
  'anon cannot read expenses at all'
);
select throws_ok(
  $$ select count(*) from public.expense_shares $$,
  '42501', null,
  'anon cannot read expense shares at all'
);

-- Section 12, Q5: a block between two members doesn't hide their costs from
-- each other inside the trip.
reset role;
select tests.clear_auth();
insert into public.blocks (blocker_id, blocked_id) values (tests.id('alice'), tests.id('bob'));
select tests.authenticate_as('bob');
select is(
  (select count(*)::int from public.expenses e
   where e.trip_id = tests.id('Private ledger') and e.payer_id = tests.id('alice')),
  1,
  'a member blocked by the payer still reads the expense'
);

-- ----------------------------------------------------------------------------
-- private.equal_shares on fixed ids. lib/expenses.test.ts runs splitEqual on
-- the same fixture and expects the same shares.
-- ----------------------------------------------------------------------------

reset role;
select tests.clear_auth();
select results_eq(
  $$ select member_id, amount from private.equal_shares(10,
       array['a0000000-0000-4000-8000-000000000000', '0f000000-0000-4000-8000-000000000000',
             'f0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000000']::uuid[],
       'f0000000-0000-4000-8000-000000000001') $$,
  $$ values ('0f000000-0000-4000-8000-000000000000'::uuid, 3::bigint),
            ('10000000-0000-4000-8000-000000000000', 2),
            ('a0000000-0000-4000-8000-000000000000', 2),
            ('f0000000-0000-4000-8000-000000000001', 3) $$,
  'fixture 1: 10 four ways, payer in the split'
);
select results_eq(
  $$ select member_id, amount from private.equal_shares(10,
       array['a0000000-0000-4000-8000-000000000000', '0f000000-0000-4000-8000-000000000000',
             '10000000-0000-4000-8000-000000000000']::uuid[],
       'f0000000-0000-4000-8000-000000000001') $$,
  $$ values ('0f000000-0000-4000-8000-000000000000'::uuid, 4::bigint),
            ('10000000-0000-4000-8000-000000000000', 3),
            ('a0000000-0000-4000-8000-000000000000', 3) $$,
  'fixture 2: 10 three ways, payer outside the split'
);
select results_eq(
  $$ select member_id, amount from private.equal_shares(2,
       array['10000000-0000-4000-8000-000000000000', 'a0000000-0000-4000-8000-000000000000',
             '0f000000-0000-4000-8000-000000000000']::uuid[],
       '10000000-0000-4000-8000-000000000000') $$,
  $$ values ('0f000000-0000-4000-8000-000000000000'::uuid, 1::bigint),
            ('10000000-0000-4000-8000-000000000000', 1),
            ('a0000000-0000-4000-8000-000000000000', 0) $$,
  'fixture 3: 2 three ways, fewer cents than members'
);
select results_eq(
  $$ select member_id, amount from private.equal_shares(3,
       array['0f000000-0000-4000-8000-000000000001', '0f000000-0000-4000-8000-000000000000']::uuid[],
       'f0000000-0000-4000-8000-000000000001') $$,
  $$ values ('0f000000-0000-4000-8000-000000000000'::uuid, 2::bigint),
            ('0f000000-0000-4000-8000-000000000001', 1) $$,
  'fixture 4: ids that differ only in the last digit'
);
select results_eq(
  $$ select member_id, amount from private.equal_shares(10000,
       array['a0000000-0000-4000-8000-000000000000', '0f000000-0000-4000-8000-000000000000',
             '10000000-0000-4000-8000-000000000000']::uuid[],
       'a0000000-0000-4000-8000-000000000000') $$,
  $$ values ('0f000000-0000-4000-8000-000000000000'::uuid, 3333::bigint),
            ('10000000-0000-4000-8000-000000000000', 3333),
            ('a0000000-0000-4000-8000-000000000000', 3334) $$,
  'fixture 5: the payer has the highest id and still takes the odd cent'
);

-- ----------------------------------------------------------------------------
-- The trip's currency, and deleting a trip
-- ----------------------------------------------------------------------------

select throws_ok(
  $$ update public.trips set currency = 'EUR' where id = tests.id('Ledger trip') $$,
  '23514', null,
  'a trip''s currency cannot change once it has expenses'
);
select lives_ok(
  $$ update public.trips set currency = 'EUR' where id = tests.id('Cody trip') $$,
  'a trip without expenses can still change currency'
);

select tests.authenticate_as('bob');
select is(
  (select status from public.record_settlement(
     tests.id('Public ledger'), tests.id('bob'), tests.id('alice'), 2500)),
  'ok',
  'bob settles up, since a trip is deleted only at zero (tripplanner-2o5.3)'
);

reset role;
select tests.authenticate_as('alice');
select is(public.delete_trip(tests.id('Public ledger')),
  'ok', 'the organizer can delete a trip that has expenses');

reset role;
select tests.clear_auth();
select is(
  (select count(*)::int from public.expenses where trip_id = tests.id('Public ledger'))
  + (select count(*)::int from public.expense_shares where trip_id = tests.id('Public ledger')),
  0,
  'deleting a trip deletes its expenses and their shares'
);

-- ----------------------------------------------------------------------------
-- Rate limits
-- ----------------------------------------------------------------------------

update private.rate_limit_rules set max_count = 1 where surface = 'expense_write';
select tests.create_trip('frank', 'Frank trip');

select tests.authenticate_as('frank');
select is(
  (select status from public.create_expense(
     tests.id('Frank trip'), tests.id('frank'), 'First', 100, 'equal', array[tests.id('frank')])),
  'ok',
  'the first expense in the window is saved'
);
select is(
  (select status from public.create_expense(
     tests.id('Frank trip'), tests.id('frank'), 'Second', 100, 'equal', array[tests.id('frank')])),
  'rate_limited',
  'adding past the limit is refused'
);

reset role;
select tests.clear_auth();
insert into tests.ids (name, id)
select 'First', e.id from public.expenses e where e.trip_id = tests.id('Frank trip');

select tests.authenticate_as('frank');
select is(
  public.update_expense(tests.id('First'), tests.id('frank'), 'First, renamed', 100, 'equal',
    array[tests.id('frank')]),
  'rate_limited',
  'edits share the limit'
);
select is(public.delete_expense(tests.id('First')),
  'rate_limited', 'and so do deletes');

reset role;
select tests.clear_auth();
select results_eq(
  $$ select description, deleted_at from public.expenses where trip_id = tests.id('Frank trip') $$,
  $$ values ('First'::text, null::timestamptz) $$,
  'refused writes change nothing'
);

-- ----------------------------------------------------------------------------
-- Shares always add up, whoever writes them. Deferred checks run at commit,
-- and these tests roll back, so force them now.
-- ----------------------------------------------------------------------------

select lives_ok(
  'set constraints all immediate',
  'every expense written above has shares that add up to its amount'
);
select throws_ok(
  $$ with e as (
       insert into public.expenses (trip_id, payer_id, description, amount, split, created_by)
       values (tests.id('Ledger trip'), tests.id('alice'), 'Wrong sum', 100, 'exact', tests.id('alice'))
       returning id, trip_id
     )
     insert into public.expense_shares (expense_id, trip_id, member_id, amount)
     select e.id, e.trip_id, tests.id('alice'), 99 from e $$,
  '23514', null,
  'the database refuses shares that do not add up, even from the owner'
);

select * from finish();
rollback;
