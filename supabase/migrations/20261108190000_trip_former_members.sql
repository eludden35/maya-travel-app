-- =============================================================================
-- get_trip_former_members: the names on a trip's ledger that have left the
-- member list. Bead tripplanner-2o5.5 (UAT-1 epic tripplanner-2o5).
--
-- Someone who leaves or is removed keeps their shares and payments on old
-- expenses, but get_trip_members no longer lists them, so a ledger couldn't
-- say who they were. Founder decision (2026-11-08): show the real name, marked
-- as having left. A generic label stops being readable once two people have
-- gone.
--
-- Returns only people who still appear on a live ledger row of this trip and
-- aren't current members, and only their display name, which the caller's
-- co-members already saw while they shared the trip. As in get_trip_members, a
-- block doesn't hide a name here, so the ledger reads correctly.
--
-- Money-privacy hard rule (ADR 0002): it returns no rows to anyone outside the
-- trip, whatever trips.visibility says, and it returns no amounts.
-- =============================================================================

create or replace function public.get_trip_former_members(p_trip_id uuid)
returns table (profile_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name
  from (
    select e.payer_id
    from public.expenses e
    where e.trip_id = p_trip_id
      and e.deleted_at is null
    union
    select s.member_id
    from public.expense_shares s
    join public.expenses e on e.id = s.expense_id
    where s.trip_id = p_trip_id
      and e.deleted_at is null
    union
    select st.from_id
    from public.settlements st
    where st.trip_id = p_trip_id
    union
    select st.to_id
    from public.settlements st
    where st.trip_id = p_trip_id
  ) as l (profile_id)
  join public.profiles p on p.id = l.profile_id
  where private.is_trip_member(p_trip_id)
    and not exists (
      select 1
      from public.trip_members m
      where m.trip_id = p_trip_id
        and m.profile_id = l.profile_id
    )
  order by p.display_name, p.id;
$$;

revoke all on function public.get_trip_former_members(uuid) from public, anon;
grant execute on function public.get_trip_former_members(uuid) to authenticated, service_role;
