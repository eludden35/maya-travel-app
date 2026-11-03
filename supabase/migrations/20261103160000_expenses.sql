-- =============================================================================
-- expenses: a trip's shared costs and each member's share of them.
-- Bead tripplanner-2o5.2 (UAT-1 epic tripplanner-2o5). Product decisions are
-- in docs/uat/uat-1-test-plan.md section 12 (founder, 2026-11-03).
--
-- Money-privacy hard rule (ADR 0002). Both tables are readable by members of
-- the trip only, through private.is_trip_member(trip_id). No policy looks at
-- trips.visibility, follows, shared trips or blocks, and anon has no
-- privilege on either table, so a public or unlisted trip never shows an
-- amount.
--
-- Amounts are bigint minor units of trips.currency, which create_trip sets
-- and nothing changes. Expenses carry no currency of their own, so a trip has
-- one currency by construction, and a trigger below keeps it fixed once the
-- trip has an expense. The limits match lib/money.ts: an amount runs from 1
-- to MAX_AMOUNT_MINOR (99,999,999,999), a share from 0.
--
-- Writes are RPC-only, in the trip_lifecycle pattern: security definer,
-- search_path = '', identity from auth.uid() only, a status rather than an
-- exception, input checked before consume_rate_limit('expense_write'), and
-- EXECUTE revoked from public and anon.
--
--   create_expense  any member, paid by any member, split between members.
--   update_expense  the payer, the member who added it, or the organizer
--                   (section 12, Q1). Replaces every field and share.
--   delete_expense  the same people. A soft delete (Q1): the row stays, with
--                   who deleted it and when, hidden from members and left out
--                   of balances, so the founder can audit or restore it.
--
-- Splits. 'equal': the caller names the members and the server computes the
-- shares with private.equal_shares(), the rule splitEqual in lib/money.ts
-- implements (test plan section 12, Q2). 'exact': the caller gives each
-- member's share. Nothing is rounded, and a deferred constraint trigger
-- refuses, at commit, any expense whose shares don't add up to its amount,
-- however it was written.
--
-- Participants. payer_id and expense_shares.member_id hold a trip
-- member's profile id. Guest participants (tripplanner-iha) can add a
-- participant list and repoint these foreign keys without changing the
-- columns, the RPC signatures or lib/. The keys restrict deleting a profile
-- that appears in a ledger, so account deletion has to settle the money
-- first.
--
-- Leaving. Someone who leaves, or is removed, keeps their rows, and every
-- expense they're on freezes ('member_left'): changing it would move the
-- balance of someone who left settled (tripplanner-2o5.3), and the remaining
-- balances would stop summing to zero.
--
-- Locking. Each RPC locks the trip row FOR SHARE, then, in id order, the
-- trip_members rows of everyone on the old and new expense; edits and
-- deletes lock the expense row in between. leave_trip and remove_trip_member
-- lock the departing member's row FOR UPDATE, and delete_trip the trip row,
-- before asking private.trip_departure_blocker(), so an expense can't land
-- on someone between that check and their departure.
--
-- Seam for tripplanner-2o5.3: balances count expenses where deleted_at is
-- null, and their shares. A security definer function bypasses RLS, so it
-- has to filter deleted expenses itself.
-- =============================================================================

create type public.expense_split as enum ('equal', 'exact');

comment on type public.expense_split is
  'equal: the server split the amount with private.equal_shares(). exact: each member''s share was entered.';

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null
                references public.trips(id) on delete cascade,
  payer_id    uuid not null
                references public.profiles(id) on delete restrict,
  description text not null
                check (char_length(description) between 1 and 120
                       and description !~ '[[:cntrl:]]'),
  amount      bigint not null
                check (amount between 1 and 99999999999),
  split       public.expense_split not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now(),
  deleted_by  uuid references public.profiles(id) on delete set null,
  deleted_at  timestamptz,
  -- The target of expense_shares' (expense_id, trip_id) foreign key.
  unique (id, trip_id)
);

comment on table public.expenses is
  'A shared cost on a trip (tripplanner-2o5.2). Money: readable by trip members only, never by trips.visibility or any social grant. Written only by create_expense, update_expense and delete_expense.';
comment on column public.expenses.trip_id is
  'on delete cascade, so delete_trip removes the trip''s expenses and, through them, their shares.';
comment on column public.expenses.payer_id is
  'The member who paid. Holds a profile id; a guest participant id later (tripplanner-iha).';
comment on column public.expenses.amount is
  'Integer minor units of trips.currency, 1 to 99,999,999,999 (MAX_AMOUNT_MINOR in lib/money.ts).';
comment on column public.expenses.created_by is
  'The member who added the expense, who may edit and delete it (test plan section 12, Q1).';
comment on column public.expenses.updated_by is
  'Who last edited the expense; null until the first edit.';
comment on column public.expenses.deleted_at is
  'Soft delete (test plan section 12, Q1): set rows are hidden from members and left out of balances, and kept for audit and restore.';

create table public.expense_shares (
  expense_id uuid not null,
  trip_id    uuid not null,
  member_id  uuid not null
               references public.profiles(id) on delete restrict,
  amount     bigint not null
               check (amount between 0 and 99999999999),
  primary key (expense_id, member_id),
  -- Keeps each share in its expense's trip, so the policy can check
  -- membership on trip_id directly.
  foreign key (expense_id, trip_id)
    references public.expenses (id, trip_id) on delete cascade
);

comment on table public.expense_shares is
  'A member''s share of an expense (tripplanner-2o5.2). Money: readable by trip members only. The shares of an expense always add up to its amount (checked at commit).';
comment on column public.expense_shares.member_id is
  'The member who owes this share. Holds a profile id; a guest participant id later (tripplanner-iha).';
comment on column public.expense_shares.amount is
  'Integer minor units of trips.currency, 0 to 99,999,999,999. Zero means in the split but owing nothing.';

-- A trip's expenses, newest first (lib/expenses.ts), and the cascade from
-- trips. Balances (tripplanner-2o5.3) read a trip's shares, or one member's;
-- the member_id and payer_id indexes also serve the restrict checks when a
-- profile is deleted. created_by, updated_by and deleted_by have no index:
-- only a rare, manual profile deletion looks them up.
create index expenses_trip_id_created_at_idx
  on public.expenses (trip_id, created_at desc);
create index expenses_payer_id_idx
  on public.expenses (payer_id);
create index expense_shares_trip_id_member_id_idx
  on public.expense_shares (trip_id, member_id);
create index expense_shares_member_id_idx
  on public.expense_shares (member_id);

-- ----------------------------------------------------------------------------
-- Reads: members of the trip only. No writes for clients.
-- ----------------------------------------------------------------------------

alter table public.expenses enable row level security;
alter table public.expense_shares enable row level security;

revoke all on table public.expenses from anon, authenticated;
revoke all on table public.expense_shares from anon, authenticated;
grant select on table public.expenses to authenticated;
grant select on table public.expense_shares to authenticated;

-- Is p_expense_id an expense that hasn't been deleted? Lets the shares
-- policy hide a deleted expense's shares without querying expenses under the
-- caller's RLS (see "Policy patterns that bit us" in supabase-security.mdc).
create or replace function private.is_live_expense(p_expense_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.expenses e
    where e.id = p_expense_id
      and e.deleted_at is null
  );
$$;

revoke all on function private.is_live_expense(uuid) from public;
grant execute on function private.is_live_expense(uuid) to authenticated, service_role;

create policy "expenses_select_members"
  on public.expenses
  for select
  to authenticated
  using (
    private.is_trip_member(trip_id)
    and deleted_at is null
  );

create policy "expense_shares_select_members"
  on public.expense_shares
  for select
  to authenticated
  using (
    private.is_trip_member(trip_id)
    and private.is_live_expense(expense_id)
  );

-- ----------------------------------------------------------------------------
-- Invariants the database keeps, whoever writes.
-- ----------------------------------------------------------------------------

-- An expense's shares add up to its amount. Deferred to commit, so an RPC can
-- replace the shares in several statements. Runs as the owner so it sees
-- every row.
create or replace function private.expense_shares_add_up()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expense_ids uuid[];
begin
  if tg_table_name = 'expenses' then
    v_expense_ids := array[new.id];
  elsif tg_op = 'INSERT' then
    v_expense_ids := array[new.expense_id];
  elsif tg_op = 'DELETE' then
    v_expense_ids := array[old.expense_id];
  else
    v_expense_ids := array[old.expense_id, new.expense_id];
  end if;

  -- An expense deleted since (a deleted trip's, say) has nothing to check.
  if exists (
    select 1
    from public.expenses e
    where e.id = any (v_expense_ids)
      and e.amount <> (
        select coalesce(sum(s.amount), 0)
        from public.expense_shares s
        where s.expense_id = e.id
      )
  ) then
    raise exception 'an expense''s shares must add up to its amount'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

revoke all on function private.expense_shares_add_up() from public;

create constraint trigger expenses_amount_equals_shares
  after insert or update of amount on public.expenses
  deferrable initially deferred
  for each row execute function private.expense_shares_add_up();

create constraint trigger expense_shares_equal_amount
  after insert or update or delete on public.expense_shares
  deferrable initially deferred
  for each row execute function private.expense_shares_add_up();

-- Every amount in a trip counts minor units of its currency, so once the
-- trip has an expense (a deleted one included: a restore brings it back) the
-- currency can't change. Nothing changes it today (tripplanner-718); this
-- stops a later currency picker, or a hand-written fix, from re-denominating
-- the amounts.
create or replace function private.trips_keep_currency_with_expenses()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.expenses e where e.trip_id = old.id) then
    raise exception 'a trip''s currency can''t change once it has expenses'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.trips_keep_currency_with_expenses() from public;

create trigger trips_keep_currency_with_expenses
  before update of currency on public.trips
  for each row
  when (old.currency is distinct from new.currency)
  execute function private.trips_keep_currency_with_expenses();

-- ----------------------------------------------------------------------------
-- Rate limit: create, edit and delete share one budget.
-- ----------------------------------------------------------------------------

insert into private.rate_limit_rules (surface, max_count, window_seconds) values
  ('expense_write', 120, 3600);

-- ----------------------------------------------------------------------------
-- Helpers. Only the RPCs below call them, as their owner.
-- ----------------------------------------------------------------------------

-- Splits p_amount equally between p_member_ids, by the rule splitEqual in
-- lib/money.ts implements (test plan section 12, Q2). Everyone gets
-- p_amount / n rounded down; the leftover minor units go one each to the
-- payer first, if they're in the split, then to the others in ascending id
-- order. uuid order is the order splitEqual compares lowercase ids in.
-- Expects distinct, non-null ids, which the RPCs check first.
create or replace function private.equal_shares(
  p_amount     bigint,
  p_member_ids uuid[],
  p_payer_id   uuid
)
returns table (member_id uuid, amount bigint)
language sql
immutable
set search_path = ''
as $$
  select m.id,
         p_amount / n.members
           + (row_number() over (order by m.id = p_payer_id desc, m.id)
              <= p_amount % n.members)::int
  from unnest(p_member_ids) as m(id)
  cross join (select cardinality(p_member_ids)::bigint as members) as n
  order by m.id;
$$;

-- Why an expense can't be saved as given, or null. Checks the input only;
-- who is in the trip is checked under lock. p_description arrives trimmed.
create or replace function private.expense_input_problem(
  p_description text,
  p_amount      bigint,
  p_split       public.expense_split,
  p_member_ids  uuid[],
  p_amounts     bigint[]
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_description is null
     or char_length(p_description) not between 1 and 120
     or p_description ~ '[[:cntrl:]]' then
    return 'invalid_description';
  end if;
  if p_amount is null or p_amount not between 1 and 99999999999 then
    return 'invalid_amount';
  end if;

  -- Who's in the split: a flat list of distinct ids. Each check is its own
  -- statement because array_position() fails on a nested array.
  if p_split is null or coalesce(array_ndims(p_member_ids), 0) <> 1 then
    return 'invalid_shares';
  end if;
  if array_position(p_member_ids, null) is not null
     or (select count(distinct m.id) from unnest(p_member_ids) as m(id))
        <> cardinality(p_member_ids) then
    return 'invalid_shares';
  end if;

  -- The server computes equal shares, so amounts sent with one are a bug.
  if p_split = 'equal' then
    if p_amounts is not null then
      return 'invalid_shares';
    end if;
    return null;
  end if;

  -- Exact: one share per member, each from 0 to the maximum, adding up to
  -- the amount.
  if coalesce(array_ndims(p_amounts), 0) <> 1
     or cardinality(p_amounts) <> cardinality(p_member_ids) then
    return 'invalid_shares';
  end if;
  if array_position(p_amounts, null) is not null
     or exists (
       select 1 from unnest(p_amounts) as a(amount)
       where a.amount not between 0 and 99999999999
     ) then
    return 'invalid_shares';
  end if;
  if (select sum(a.amount) from unnest(p_amounts) as a(amount)) <> p_amount then
    return 'shares_mismatch';
  end if;
  return null;
end;
$$;

-- Locks p_trip_id's membership rows for p_profile_ids FOR SHARE, in id order,
-- and says whether every id is a member. A departure that holds a row first
-- makes this wait, then find the row gone.
create or replace function private.lock_trip_members(
  p_trip_id     uuid,
  p_profile_ids uuid[]
)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_wanted bigint;
  v_locked bigint;
begin
  if array_position(p_profile_ids, null) is not null then
    return false;
  end if;
  select count(distinct p.id) into v_wanted from unnest(p_profile_ids) as p(id);

  select count(*) into v_locked
  from (
    select 1
    from public.trip_members m
    where m.trip_id = p_trip_id
      and m.profile_id = any (p_profile_ids)
    order by m.profile_id
    for share of m
  ) as locked;

  return v_locked = v_wanted;
end;
$$;

-- Locks an expense the caller wants to edit or delete, and says why they
-- can't, or null when they can:
--   not_found    no such expense, or it's deleted, or not in a trip of theirs;
--   forbidden    not the payer, the member who added it or the organizer;
--   member_left  someone on it has left the trip.
create or replace function private.expense_change_problem(p_expense_id uuid)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_trip_id uuid;
  v_payer   uuid;
  v_creator uuid;
begin
  select e.trip_id into v_trip_id
  from public.expenses e
  where e.id = p_expense_id
    and e.deleted_at is null;
  if not found or not private.is_trip_member(v_trip_id) then
    return 'not_found';
  end if;

  -- The trip row, then the expense row: the order delete_trip's cascade
  -- takes them in.
  perform 1 from public.trips t where t.id = v_trip_id for share;
  select e.payer_id, e.created_by into v_payer, v_creator
  from public.expenses e
  where e.id = p_expense_id
    and e.deleted_at is null
  for update;
  if not found then
    return 'not_found';
  end if;

  if v_uid is distinct from v_payer
     and v_uid is distinct from v_creator
     and not private.is_trip_organizer(v_trip_id) then
    return 'forbidden';
  end if;

  if not private.lock_trip_members(
    v_trip_id,
    array_append(
      array(select s.member_id from public.expense_shares s where s.expense_id = p_expense_id),
      v_payer
    )
  ) then
    return 'member_left';
  end if;
  return null;
end;
$$;

-- Writes an expense's shares: computed for an equal split, as given for an
-- exact one. Expects input that expense_input_problem() accepted.
create or replace function private.insert_expense_shares(
  p_expense_id uuid,
  p_trip_id    uuid,
  p_payer_id   uuid,
  p_amount     bigint,
  p_split      public.expense_split,
  p_member_ids uuid[],
  p_amounts    bigint[]
)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  if p_split = 'equal' then
    insert into public.expense_shares (expense_id, trip_id, member_id, amount)
    select p_expense_id, p_trip_id, s.member_id, s.amount
    from private.equal_shares(p_amount, p_member_ids, p_payer_id) as s;
  else
    insert into public.expense_shares (expense_id, trip_id, member_id, amount)
    select p_expense_id, p_trip_id, x.member_id, x.amount
    from unnest(p_member_ids, p_amounts) as x(member_id, amount);
  end if;
end;
$$;

revoke all on function private.equal_shares(bigint, uuid[], uuid) from public;
revoke all on function private.expense_input_problem(text, bigint, public.expense_split, uuid[], bigint[]) from public;
revoke all on function private.lock_trip_members(uuid, uuid[]) from public;
revoke all on function private.expense_change_problem(uuid) from public;
revoke all on function private.insert_expense_shares(uuid, uuid, uuid, bigint, public.expense_split, uuid[], bigint[]) from public;

-- ----------------------------------------------------------------------------
-- RPCs. Each returns a status rather than raising, so a rate-limit charge is
-- kept even when the write is refused afterwards. Bad input is refused before
-- the charge. A caller outside the trip gets 'not_found', the same as for a
-- trip or expense that doesn't exist.
--
-- Equal split: p_member_ids only; leave p_amounts null. Exact split:
-- p_amounts[i] is p_member_ids[i]'s share.
-- ----------------------------------------------------------------------------

-- Statuses: ok | unauthorized | not_found | invalid_description |
--           invalid_amount | invalid_shares | not_a_member |
--           shares_mismatch | rate_limited
create or replace function public.create_expense(
  p_trip_id     uuid,
  p_payer_id    uuid,
  p_description text,
  p_amount      bigint,
  p_split       public.expense_split,
  p_member_ids  uuid[],
  p_amounts     bigint[] default null
)
returns table (status text, expense_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := (select auth.uid());
  v_description text := btrim(coalesce(p_description, ''), E' \t\r\n');
  v_problem     text;
  v_expense_id  uuid;
begin
  if v_uid is null then
    return query select 'unauthorized'::text, null::uuid;
    return;
  end if;
  if not private.is_trip_member(p_trip_id) then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;
  -- Holds off delete_trip until this transaction ends.
  perform 1 from public.trips t where t.id = p_trip_id for share;
  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  v_problem := private.expense_input_problem(v_description, p_amount, p_split, p_member_ids, p_amounts);
  if v_problem is not null then
    return query select v_problem, null::uuid;
    return;
  end if;
  if not private.lock_trip_members(p_trip_id, array_append(p_member_ids, p_payer_id)) then
    return query select 'not_a_member'::text, null::uuid;
    return;
  end if;

  if public.consume_rate_limit('expense_write') > 0 then
    return query select 'rate_limited'::text, null::uuid;
    return;
  end if;

  insert into public.expenses (trip_id, payer_id, description, amount, split, created_by)
  values (p_trip_id, p_payer_id, v_description, p_amount, p_split, v_uid)
  returning id into v_expense_id;

  perform private.insert_expense_shares(
    v_expense_id, p_trip_id, p_payer_id, p_amount, p_split, p_member_ids, p_amounts);

  return query select 'ok'::text, v_expense_id;
end;
$$;

-- Replaces an expense's payer, description, amount, split and shares.
-- Statuses: ok | unauthorized | not_found | forbidden | member_left |
--           invalid_description | invalid_amount | invalid_shares |
--           not_a_member | shares_mismatch | rate_limited
create or replace function public.update_expense(
  p_expense_id  uuid,
  p_payer_id    uuid,
  p_description text,
  p_amount      bigint,
  p_split       public.expense_split,
  p_member_ids  uuid[],
  p_amounts     bigint[] default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := (select auth.uid());
  v_description text := btrim(coalesce(p_description, ''), E' \t\r\n');
  v_problem     text;
  v_trip_id     uuid;
begin
  if v_uid is null then
    return 'unauthorized';
  end if;

  v_problem := private.expense_change_problem(p_expense_id);
  if v_problem is not null then
    return v_problem;
  end if;
  select e.trip_id into v_trip_id from public.expenses e where e.id = p_expense_id;

  v_problem := private.expense_input_problem(v_description, p_amount, p_split, p_member_ids, p_amounts);
  if v_problem is not null then
    return v_problem;
  end if;
  if not private.lock_trip_members(v_trip_id, array_append(p_member_ids, p_payer_id)) then
    return 'not_a_member';
  end if;

  if public.consume_rate_limit('expense_write') > 0 then
    return 'rate_limited';
  end if;

  update public.expenses e
  set payer_id    = p_payer_id,
      description = v_description,
      amount      = p_amount,
      split       = p_split,
      updated_by  = v_uid,
      updated_at  = now()
  where e.id = p_expense_id;

  delete from public.expense_shares s where s.expense_id = p_expense_id;
  perform private.insert_expense_shares(
    p_expense_id, v_trip_id, p_payer_id, p_amount, p_split, p_member_ids, p_amounts);

  return 'ok';
end;
$$;

-- Soft-deletes an expense (test plan section 12, Q1).
-- Statuses: ok | unauthorized | not_found | forbidden | member_left |
--           rate_limited
create or replace function public.delete_expense(p_expense_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_problem text;
begin
  if v_uid is null then
    return 'unauthorized';
  end if;

  v_problem := private.expense_change_problem(p_expense_id);
  if v_problem is not null then
    return v_problem;
  end if;

  if public.consume_rate_limit('expense_write') > 0 then
    return 'rate_limited';
  end if;

  update public.expenses e
  set deleted_at = now(),
      deleted_by = v_uid
  where e.id = p_expense_id;

  return 'ok';
end;
$$;

revoke all on function public.create_expense(uuid, uuid, text, bigint, public.expense_split, uuid[], bigint[]) from public, anon;
revoke all on function public.update_expense(uuid, uuid, text, bigint, public.expense_split, uuid[], bigint[]) from public, anon;
revoke all on function public.delete_expense(uuid) from public, anon;
grant execute on function public.create_expense(uuid, uuid, text, bigint, public.expense_split, uuid[], bigint[]) to authenticated, service_role;
grant execute on function public.update_expense(uuid, uuid, text, bigint, public.expense_split, uuid[], bigint[]) to authenticated, service_role;
grant execute on function public.delete_expense(uuid) to authenticated, service_role;
