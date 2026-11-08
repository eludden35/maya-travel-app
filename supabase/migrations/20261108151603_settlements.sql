-- =============================================================================
-- settlements: mark a debt as paid, void a payment, read a trip's balances,
-- and the balance rule for leaving a trip. Bead tripplanner-2o5.3 (UAT-1 epic
-- tripplanner-2o5). Product decisions are in docs/uat/uat-1-test-plan.md
-- section 12, Q3 (founder, 2026-11-08).
--
-- A settlement records that one member paid another outside the app. Either
-- of the two records it, and it counts toward balances at once: there is no
-- confirmation step. Any amount from 1 to 99,999,999,999 minor units is
-- accepted, so partial payments and overpayments record as entered.
--
-- Append-only. A mistake is voided, never edited or deleted. void_settlement
-- inserts a reversing row: the same amount paid back the other way, pointing
-- at the settlement it reverses. Either party may void. A settlement is voided
-- at most once, and a void can't itself be voided (record the payment again
-- instead), so a history reads paid, voided, paid (test plan S5 step 7) and
-- every row stays for audit. The privileges below keep clients out, and a
-- trigger holds the rule against every writer, the RPCs and the owner
-- included. The one exception is the cascade from a deleted trip.
--
-- Money-privacy hard rule (ADR 0002). Settlements are readable by members of
-- the trip only, through private.is_trip_member(trip_id). No policy looks at
-- trips.visibility, follows, shared trips or blocks, and anon has no
-- privilege on the table, so a public or unlisted trip never shows an amount.
-- trip_balances() returns no rows to anyone outside the trip.
--
-- Amounts are bigint minor units of trips.currency. Settlements carry no
-- currency of their own, so a trip has one currency by construction, and the
-- currency trigger below keeps it fixed once the trip has a settlement.
--
-- Writes are RPC-only, in the trip_lifecycle pattern: security definer,
-- search_path = '', identity from auth.uid() only, a status rather than an
-- exception, input checked before consume_rate_limit('settlement_write'), and
-- EXECUTE revoked from public and anon.
--
--   record_settlement  either party, between two current members of the trip.
--   void_settlement    either party to the settlement, while both are still
--                      in the trip.
--   trip_balances      each member's net balance, for the trip's members.
--
-- Balances. A member's net is what they paid for live expenses, minus their
-- shares of live expenses, plus the settlements they paid, minus the
-- settlements they received. Positive is owed money and negative owes, as
-- Balance in lib/money.ts, and a trip's nets always sum to zero. A deleted
-- expense doesn't count (deleted_at is set), and a void pays the amount back,
-- so it nets out with no special case. simplifyDebts() in lib/money.ts turns
-- the nets into suggested payments.
--
-- Leaving. private.trip_departure_blocker() now returns 'unsettled_balance'
-- for anyone whose net isn't zero, so leave_trip, remove_trip_member and
-- delete_trip (which asks about every member) refuse until they've settled.
-- Once someone has left, nothing can move their balance: expenses they're on
-- are frozen (tripplanner-2o5.2), a settlement needs both parties in the trip,
-- and a void of one they were party to is refused ('member_left').
--
-- Locking, in the order the expense RPCs use. The trip row FOR SHARE, which
-- holds off delete_trip (it locks that row FOR UPDATE before asking the
-- blocker). Then, for a void, the settlement FOR UPDATE, so a second void of
-- it waits and then finds it voided. Then both parties' trip_members rows FOR
-- SHARE in id order, which holds off leave_trip and remove_trip_member (they
-- lock the departing member's row FOR UPDATE before asking the blocker). So a
-- settlement can't land on, or be voided under, someone between that check
-- and their departure.
--
-- Participants. from_id and to_id hold a trip member's profile id, like
-- expenses.payer_id. Guest participants (tripplanner-iha) can repoint these
-- foreign keys without changing the columns. The keys restrict deleting a
-- profile that appears in a ledger, so account deletion has to deal with the
-- money first.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Table
-- ----------------------------------------------------------------------------

create table public.settlements (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null
                references public.trips(id) on delete cascade,
  from_id     uuid not null
                references public.profiles(id) on delete restrict,
  to_id       uuid not null
                references public.profiles(id) on delete restrict,
  amount      bigint not null
                check (amount between 1 and 99999999999),
  reverses_id uuid
                constraint settlements_reverses_id_key unique,
  created_by  uuid not null
                references public.profiles(id) on delete restrict,
  created_at  timestamptz not null default now(),
  constraint settlements_parties_differ check (from_id <> to_id),
  -- The target of the foreign key below.
  constraint settlements_reversal_target unique (id, trip_id, from_id, to_id, amount),
  -- A void reverses a settlement in the same trip, for the same amount,
  -- between the same two members the other way round. No action on delete:
  -- rows go only with their trip, and then a settlement and its void go in
  -- the same statement.
  constraint settlements_reverses_fkey
    foreign key (reverses_id, trip_id, to_id, from_id, amount)
    references public.settlements (id, trip_id, from_id, to_id, amount)
    on delete no action
);

comment on table public.settlements is
  'Payments between trip members made outside the app (tripplanner-2o5.3). Money: readable by trip members only, never by trips.visibility or any social grant. Append-only, and written only by record_settlement and void_settlement.';
comment on column public.settlements.trip_id is
  'on delete cascade, so delete_trip removes the trip''s settlements. delete_trip refuses until every balance is zero.';
comment on column public.settlements.from_id is
  'The member who paid. On a void, the member who was paid by the settlement it reverses. Holds a profile id; a guest participant id later (tripplanner-iha).';
comment on column public.settlements.to_id is
  'The member who was paid. On a void, the member who paid in the settlement it reverses. Holds a profile id; a guest participant id later (tripplanner-iha).';
comment on column public.settlements.amount is
  'Integer minor units of trips.currency, 1 to 99,999,999,999 (MAX_AMOUNT_MINOR in lib/money.ts).';
comment on column public.settlements.reverses_id is
  'Set on a void: the settlement it reverses, once at most. A void swaps the parties and keeps the amount, so summing rows nets it out.';
comment on column public.settlements.created_by is
  'The member who recorded this row, which is who voided it on a void. Always known: a ledger row keeps its author.';

-- A trip's settlements, newest first (lib/settlements.ts), balances, and the
-- cascade from trips. The from_id and to_id indexes serve the restrict checks
-- when a profile is deleted. created_by has no index: only a rare, manual
-- profile deletion looks it up.
create index settlements_trip_id_created_at_idx
  on public.settlements (trip_id, created_at desc);
create index settlements_from_id_idx
  on public.settlements (from_id);
create index settlements_to_id_idx
  on public.settlements (to_id);

-- ----------------------------------------------------------------------------
-- Reads: members of the trip only. No writes for clients, and no updates or
-- deletes for the secret key either.
-- ----------------------------------------------------------------------------

alter table public.settlements enable row level security;

revoke all on table public.settlements from anon, authenticated, service_role;
grant select on table public.settlements to authenticated, service_role;

create policy "settlements_select_members"
  on public.settlements
  for select
  to authenticated
  using (private.is_trip_member(trip_id));

-- ----------------------------------------------------------------------------
-- Invariants the database keeps, whoever writes.
-- ----------------------------------------------------------------------------

-- Refuses every UPDATE, DELETE and TRUNCATE, for the owner and the security
-- definer RPCs too. Rows go only by the cascade from a deleted trip, when the
-- trip row is already gone.
create or replace function private.settlements_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.trips t where t.id = old.trip_id) then
      return old;
    end if;
  end if;
  raise exception 'settlements are append-only: void a settlement instead of changing it'
    using errcode = '42501';
end;
$$;

create trigger settlements_no_update_or_delete
  before update or delete on public.settlements
  for each row execute function private.settlements_append_only();

create trigger settlements_no_truncate
  before truncate on public.settlements
  for each statement execute function private.settlements_append_only();

-- A void reverses a payment, never another void. To undo a void, record the
-- payment again. The foreign key holds a void to its settlement's trip,
-- parties and amount, and the unique key to one void per settlement.
create or replace function private.settlements_void_payments_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.settlements s
    where s.id = new.reverses_id
      and s.reverses_id is not null
  ) then
    raise exception 'a void can''t itself be voided: record the payment again'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger settlements_void_payments_only
  before insert on public.settlements
  for each row
  when (new.reverses_id is not null)
  execute function private.settlements_void_payments_only();

revoke all on function private.settlements_append_only() from public;
revoke all on function private.settlements_void_payments_only() from public;

-- Every amount in a trip counts minor units of its currency, so the currency
-- stays fixed once the trip has an expense or a settlement. This replaces the
-- tripplanner-2o5.2 body and keeps its name, which the trigger on trips uses.
create or replace function private.trips_keep_currency_with_expenses()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.expenses e where e.trip_id = old.id)
     or exists (select 1 from public.settlements s where s.trip_id = old.id) then
    raise exception 'a trip''s currency can''t change once it has expenses or settlements'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Rate limit: recording and voiding share one budget.
-- ----------------------------------------------------------------------------

insert into private.rate_limit_rules (surface, max_count, window_seconds) values
  ('settlement_write', 60, 3600);

-- ----------------------------------------------------------------------------
-- Balances
-- ----------------------------------------------------------------------------

-- Everyone's net in p_trip_id, for each person with a row in its ledger (see
-- "Balances" above). Runs as whoever calls it and checks nothing, so only
-- trip_balances() and trip_departure_blocker() call it, as the owner. Deleted
-- expenses are filtered here because the owner bypasses RLS.
create or replace function private.trip_nets(p_trip_id uuid)
returns table (profile_id uuid, net bigint)
language sql
stable
set search_path = ''
as $$
  select l.profile_id, sum(l.amount)::bigint
  from (
    select e.payer_id, e.amount
    from public.expenses e
    where e.trip_id = p_trip_id
      and e.deleted_at is null
    union all
    select s.member_id, -s.amount
    from public.expense_shares s
    join public.expenses e on e.id = s.expense_id
    where s.trip_id = p_trip_id
      and e.deleted_at is null
    union all
    select st.from_id, st.amount
    from public.settlements st
    where st.trip_id = p_trip_id
    union all
    select st.to_id, -st.amount
    from public.settlements st
    where st.trip_id = p_trip_id
  ) as l (profile_id, amount)
  group by l.profile_id;
$$;

revoke all on function private.trip_nets(uuid) from public;

-- Replaces the tripplanner-718 stand-in, same signature. leave_trip and
-- remove_trip_member ask this for the departing member, and delete_trip for
-- every member. A member with no ledger rows has no row here, so null.
create or replace function private.trip_departure_blocker(
  p_trip_id    uuid,
  p_profile_id uuid
)
returns text
language sql
stable
set search_path = ''
as $$
  select 'unsettled_balance'
  from private.trip_nets(p_trip_id) as n
  where n.profile_id = p_profile_id
    and n.net <> 0;
$$;

revoke all on function private.trip_departure_blocker(uuid, uuid) from public;

-- ----------------------------------------------------------------------------
-- RPCs. Each write returns a status rather than raising, so a rate-limit
-- charge is kept even when the write is refused afterwards. Bad input is
-- refused before the charge. A caller outside the trip gets 'not_found', the
-- same as for a trip or settlement that doesn't exist.
-- ----------------------------------------------------------------------------

-- Each member's net balance in p_trip_id, for the trip's members only: anyone
-- else, followers and public-trip viewers included, gets no rows. Every
-- current member has a row, zero included. Someone who has left appears only
-- with a nonzero balance, which the balance rule makes impossible from this
-- migration on, so the rows of a trip always sum to zero.
create or replace function public.trip_balances(p_trip_id uuid)
returns table (member_id uuid, net bigint, is_member boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_trip_member(p_trip_id) then
    return;
  end if;

  return query
    select coalesce(m.profile_id, n.profile_id),
           coalesce(n.net, 0),
           m.profile_id is not null
    from (
      select tm.profile_id
      from public.trip_members tm
      where tm.trip_id = p_trip_id
    ) as m
    full join private.trip_nets(p_trip_id) as n
      on n.profile_id = m.profile_id
    where m.profile_id is not null
       or n.net <> 0
    order by 3 desc, 1;
end;
$$;

-- Records that p_from_id paid p_to_id p_amount outside the app (test plan S5
-- step 4). Either of them may record it (section 12, Q3).
-- Statuses: ok | unauthorized | not_found | invalid_amount | same_member |
--           forbidden | not_a_member | rate_limited
create or replace function public.record_settlement(
  p_trip_id uuid,
  p_from_id uuid,
  p_to_id   uuid,
  p_amount  bigint
)
returns table (status text, settlement_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid           uuid := (select auth.uid());
  v_settlement_id uuid;
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

  if p_amount is null or p_amount not between 1 and 99999999999 then
    return query select 'invalid_amount'::text, null::uuid;
    return;
  end if;
  if p_from_id is null or p_to_id is null then
    return query select 'not_a_member'::text, null::uuid;
    return;
  end if;
  if p_from_id = p_to_id then
    return query select 'same_member'::text, null::uuid;
    return;
  end if;
  if v_uid <> p_from_id and v_uid <> p_to_id then
    return query select 'forbidden'::text, null::uuid;
    return;
  end if;
  if not private.lock_trip_members(p_trip_id, array[p_from_id, p_to_id]) then
    return query select 'not_a_member'::text, null::uuid;
    return;
  end if;

  if public.consume_rate_limit('settlement_write') > 0 then
    return query select 'rate_limited'::text, null::uuid;
    return;
  end if;

  insert into public.settlements (trip_id, from_id, to_id, amount, created_by)
  values (p_trip_id, p_from_id, p_to_id, p_amount, v_uid)
  returning id into v_settlement_id;

  return query select 'ok'::text, v_settlement_id;
end;
$$;

-- Voids a settlement by recording its reverse (test plan S5 step 6). Either
-- party may void it, once, while both are still in the trip. A void isn't a
-- payment, so there is nothing to void on one: 'not_found'.
-- Statuses: ok | unauthorized | not_found | forbidden | already_voided |
--           member_left | rate_limited
create or replace function public.void_settlement(p_settlement_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_trip_id uuid;
  v_from_id uuid;
  v_to_id   uuid;
  v_amount  bigint;
begin
  if v_uid is null then
    return 'unauthorized';
  end if;

  select s.trip_id into v_trip_id
  from public.settlements s
  where s.id = p_settlement_id
    and s.reverses_id is null;
  if not found or not private.is_trip_member(v_trip_id) then
    return 'not_found';
  end if;

  -- The trip row, then the settlement row: the order delete_trip's cascade
  -- takes them in. A second void of this settlement waits here, then finds
  -- the first one's row below.
  perform 1 from public.trips t where t.id = v_trip_id for share;
  select s.from_id, s.to_id, s.amount into v_from_id, v_to_id, v_amount
  from public.settlements s
  where s.id = p_settlement_id
  for update;
  if not found then
    return 'not_found';
  end if;

  if v_uid <> v_from_id and v_uid <> v_to_id then
    return 'forbidden';
  end if;
  if exists (select 1 from public.settlements s where s.reverses_id = p_settlement_id) then
    return 'already_voided';
  end if;
  if not private.lock_trip_members(v_trip_id, array[v_from_id, v_to_id]) then
    return 'member_left';
  end if;

  if public.consume_rate_limit('settlement_write') > 0 then
    return 'rate_limited';
  end if;

  insert into public.settlements (trip_id, from_id, to_id, amount, reverses_id, created_by)
  values (v_trip_id, v_to_id, v_from_id, v_amount, p_settlement_id, v_uid);

  return 'ok';
end;
$$;

revoke all on function public.trip_balances(uuid) from public, anon;
revoke all on function public.record_settlement(uuid, uuid, uuid, bigint) from public, anon;
revoke all on function public.void_settlement(uuid) from public, anon;
grant execute on function public.trip_balances(uuid) to authenticated, service_role;
grant execute on function public.record_settlement(uuid, uuid, uuid, bigint) to authenticated, service_role;
grant execute on function public.void_settlement(uuid) to authenticated, service_role;
