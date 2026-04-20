---
name: trip visibility model + minimal "Your trips" home-page slice (s3a.3)
overview: "Ship the `trip_visibility` enum, the `trips` + `trip_members` tables, visibility-aware RLS, and a server-only `lib/trips.ts`. Close the deferred co-trip-members branch on `profiles_select_discoverable_or_self` in the same migration. Smallest end-to-end UI slice (per the s3a.2 lesson): a read-only `Your trips` section on `app/page.tsx` that lists trips the viewer is a member of with a visibility chip + member count. No trip-create flow, no trip detail page, no money — those are filed as `tripplanner-s3a.26`. Money-privacy hard rule (ADR 0002): the new policies expose trip metadata only; monetary tables, when they ship, get their own member-only RLS that the visibility model does not relax."
todos:
  - id: migration
    content: "Write supabase/migrations/20260419190100_trips_visibility.sql: trip_visibility enum + trips table (with visibility default 'private', nullable start_date / end_date, optional description) + trip_members table (composite PK + role enum 'organizer'|'member' + per-trip uniqueness) + RLS on both (visibility-aware select on trips; members-only on trip_members; organizer-only on update/delete trips; organizer-only on insert trip_members) + indexes on every RLS-predicate column + drop-and-recreate of profiles_select_discoverable_or_self adding the co-trip-members branch (closes the seam from s3a.1) + threat-model header comment that explicitly forbids referencing monetary tables."
    status: pending
  - id: helper
    content: "lib/trips.ts (server-only): listTripsForViewer / getTripById / getTripMembers / isTripMember + Trip / TripMember / TripVisibility / TripWithMemberCount type re-exports + PG-error-code -> result-code mapping consistent with lib/follows.ts and lib/blocks.ts. No write helpers in this chunk; trip create lands in s3a.26."
    status: pending
  - id: ui
    content: "app/page.tsx (additive only): extend the existing Promise.all to add listTripsForViewer(profile.id, { limit: 5 }); render a new 'Your trips' section between the follower-counts strip and the 'People to follow' section. Each row: trip name (Fraunces), trip dates (Inter), member count (font-mono tabular-nums), visibility chip (Private / Unlisted / Public). Empty state with warm copy. Read-only — rows are non-link divs (no destination yet); follow-up Bead s3a.26 makes them clickable. Tap targets >= 44px."
    status: pending
  - id: verify
    content: "pnpm tsc --noEmit; pnpm lint; ReadLints. Boundary rg for SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|sb_secret_ in app/ lib/ proxy.ts (only doc-comment matches). Money-privacy rg: rg 'expenses|expense_shares|payouts|amount|currency' supabase/migrations/20260419190100_trips_visibility.sql returns zero matches. rg 'trips' supabase/migrations/ matches only the new file. Stop before supabase db push, type regen, and commit — orchestration is the parent agent's responsibility."
    status: pending
isProject: false
---

# s3a.3 — trip visibility model (private | unlisted | public) + minimal home-page slice

**Active Bead:** [`tripplanner-s3a.3`](#) — _feat: trip visibility model (private | unlisted | public) + RLS_, P1, parent `tripplanner-s3a`. No declared blockers.

**Bead AC (verbatim):** _trip_visibility enum exists. trips.visibility column ships with the enum. RLS policies on trips + posts + comments + reactions branch on visibility correctly. Money-table policies (expenses, expense_shares, payouts) explicitly do NOT consult visibility (review-checklist confirms)._

> **Honest scope read of the AC:** the AC mentions `posts + comments + reactions`. Those tables don't exist yet — Posts is `s3a.7`, Comments + reactions are `s3a.8`. Each will land its own migration that defines its own visibility-aware policies _by joining to `trips.visibility`_; this chunk ships the trip-side substrate they will join against, plus the trip-side policies. That split matches the "ship the substrate, file the dependent slice" lesson from s3a.1 — the post/comment/reaction policies live with their own tables, not jammed into this migration. Notes appended to s3a.7 and s3a.8 mirror the wiring contract.

## 1. Bead context

- **ID / title / priority:** `tripplanner-s3a.3` — _feat: trip visibility model (private | unlisted | public) + RLS_, P1, parent `tripplanner-s3a`.
- **AC lines this chunk satisfies in full:**
  - _trip_visibility enum exists._ — yes, this migration.
  - _trips.visibility column ships with the enum._ — yes, this migration.
  - _Money-table policies (expenses, expense_shares, payouts) explicitly do NOT consult visibility._ — vacuously satisfied: those tables do not yet exist; this migration's `trips_select_*` policies make no reference to them; verification step contains a negative `rg` for monetary table names inside the new migration file.
- **AC lines honest-deferred (with target Bead):**
  - _RLS policies on **posts + comments + reactions** branch on visibility correctly._ — those tables ship in `s3a.7` (Posts) and `s3a.8` (Comments + reactions). Each migration will join to `trips.visibility` for its own select policy. Mirroring notes appended.
- **Substrate already shipped (so the seams this chunk builds on are clear):**
  - **`s3a.1` (closed):** `profiles` table + `is_moderator()` security-definer helper + `profiles_select_discoverable_or_self` policy with the **co-trip-members branch deferred** with a documented header comment.
  - **`s3a.2` (closed):** `follows` table + drop-and-recreate of `profiles_select_discoverable_or_self` adding the **follower branch** (the co-trip-members branch was still deferred — closing it is part of THIS chunk).
  - **`s3a.16` (closed):** `blocks` + `mutes` tables, the `blocks_revoke_follows` AFTER INSERT trigger, and a second drop-and-recreate of `follows_insert_self` adding the bidirectional block check. Established the migration-immutability + seam-closure pattern that this chunk follows.
  - **`s3a.14` (closed):** `rate_limit_counters` + `try_consume_rate_limit()` SQL function + `lib/rate-limit.ts`. Not directly used in this chunk (no writes), but the pattern of a server-only helper paired with structured result types is the house style we mirror in `lib/trips.ts`.
  - **`s3a.17` (closed):** legal pages + footer. Out of band; not interacted with here.
- **Hard rules that govern this chunk:**
  1. **Money privacy (ADR 0002, supabase-security.mdc).** This is the load-bearing rule for this Bead. Even when a trip is `public`, money data is **never** readable by non-trip-members. The new `trips_select_*` policies expose trip metadata only — they do not, and never will, reference `expenses`, `expense_shares`, `payouts`, or any monetary column. Money tables, when they ship, get their own member-only RLS that does not consult `trips.visibility`. The verification step contains a hard `rg` that fails the chunk if monetary table names appear in this migration.
  2. **Image pre-moderation (ADR 0002, supabase-security.mdc).** Less directly relevant here — no image columns ship in this migration — but called out for completeness: `posts` (s3a.7) will join to `trips.visibility` for the visibility branch AND to `images.state` for the `state = 'approved'` branch. Public visibility never relaxes the pre-moderation gate.

## 2. Scope IN / OUT

### IN

1. **Migration `supabase/migrations/20260419190100_trips_visibility.sql`** — single migration, ships the `trip_visibility` enum, the `trips` table, the `trip_members` table, the `trip_member_role` enum, RLS + indexes on both tables, and the drop-and-recreate of `profiles_select_discoverable_or_self` adding the co-trip-members branch. Header threat-model comment explicitly forbids any monetary-table reference (and explains why the historical `profiles.sql` and `follows.sql` migrations are NOT modified — same migration-immutability discipline as `s3a.16`).
2. **`lib/trips.ts`** (NEW, server-only): four read helpers (`listTripsForViewer`, `getTripById`, `getTripMembers`, `isTripMember`) consumed by the home-page slice and (in a follow-up) by `s3a.26`'s trip detail page. PG-error-code mapping consistent with `lib/follows.ts` / `lib/blocks.ts`. **No write helpers** — trip create lands in `s3a.26`.
3. **Minimal end-to-end home-page slice** (per the s3a.2 lesson — pure-substrate chunks ship dead code): a `Your trips` section on `app/page.tsx`, signed-in only, between the follower-counts strip and the existing `People to follow` section. Lists trips the viewer is a member of (limit 5), most recent first, with a visibility chip + member count. Empty state with warm copy. Read-only.
4. **Drop-and-recreate of `profiles_select_discoverable_or_self`** to add the **co-trip-members branch** — closes the deferred branch documented in the s3a.1 header. Mirrors the s3a.16 "close the historical seam in the new migration, do not edit the historical file" pattern.

### OUT (explicit deferrals — file as `bd create … --discovered-from tripplanner-s3a.3`)

- **Trip create flow + trip detail page** → **`tripplanner-s3a.26`** (NEW; `--discovered-from tripplanner-s3a.3 --blocks tripplanner-s3a.3`-style linkage so it shows as blocked-by this chunk). This is the user-visible feature on top of the substrate. Sketch AC:
  - Organizer can create a trip with `name` (1..120 chars), optional `description` (<=2000 chars), optional `start_date` / `end_date`, default `visibility = 'private'`. Server Action validates + inserts; the row's `organizer_id` is set from `auth.uid()`; an organizer `trip_members` row is inserted in the same transaction (or via an AFTER INSERT trigger — decision in s3a.26).
  - Trip detail page at `/trips/[id]`. Reuses the visibility chip from this chunk. Member-list reveal respects RLS (members visible only to other members; organizer optionally exposed publicly on `public` trips — decision in s3a.26).
  - Home-page rows from this chunk become real `<Link href="/trips/{id}" />` after s3a.26 lands.
- **Posts on trips** → `tripplanner-s3a.7` (already exists). When that Bead lands, its migration joins to `trips.visibility` for the visibility branch and to `images.state = 'approved'` for the pre-moderation branch. Mirroring note appended.
- **Followers feed** → `tripplanner-s3a.10` (already exists). Feed query must respect Trip visibility + membership (only Posts in trips the viewer can see) and mute filtering (per the existing s3a.16 note on s3a.10). Mirroring note appended.
- **Explore tab** → `tripplanner-s3a.11` (already exists). Query is `where visibility = 'public' and exists (... at least one approved photo ...)`. Reuses the row-shape pattern of `listTripsForViewer` but unauthenticated and `where visibility = 'public'`. Mirroring note appended.
- **Join requests** → `tripplanner-s3a.12` (already exists). Needs `trip_id` + `from_profile_id` columns on its own `join_requests` table; trip `visibility = 'public'` (and shared `unlisted`) is the gate that opens the join-request affordance. Mirroring note appended.
- **DMs** → `tripplanner-s3a.13` (already exists). The `can_dm()` SQL function includes the "shared trip" leg, which queries `trip_members` (this chunk's table). Mirroring note appended.
- **Money tables (`expenses`, `expense_shares`, `payouts`)** — not in this chunk and intentionally not even mentioned in the new migration body. The money-privacy hard rule will be tested when those land (their own member-only `using (exists (select 1 from trip_members tm where tm.trip_id = ... and tm.profile_id = auth.uid()))` policies, never branching on `trips.visibility`).
- **Removing a member from a trip / leaving a trip** — implied by the `trip_members` table's existence but explicitly OUT here. Sketch AC for s3a.26 or a sibling Bead: organizer can remove a non-organizer member; any member can delete their own membership row (== leave); organizer cannot leave a trip without first transferring organizer role (transfer is itself a separate UI follow-up).
- **`auto_approve` flag on trips** mentioned in s3a.12's AC — column does NOT ship in this chunk. It's a join-request behavior toggle, lands in s3a.12's migration alongside the `join_requests` table. Documented in the migration header so the next agent doesn't think we forgot it.

## 3. Architecture

### Where each piece runs

- **`supabase/migrations/20260419190100_trips_visibility.sql`** — DDL + RLS. Postgres / RLS-first.
- **`lib/trips.ts`** — `import "server-only"`. All four helpers issue authenticated Supabase calls under the caller's session cookie (RLS still applies). Pulling these into the browser would require shipping the secret key (forbidden) or re-implementing RLS in the client (worse). Mirrors `lib/follows.ts` / `lib/blocks.ts` / `lib/profiles.ts` exactly.
- **`app/_actions/trips-actions.ts`** — **does not exist in this chunk.** Read-only home-page surface; no `revalidatePath` round-trip needed. The file lands in `s3a.26` with the trip-create / trip-update / leave-trip wrappers.
- **`app/page.tsx`** — Server Component. Adds one entry to the existing `Promise.all` and renders one new `<section>`. No new client component; rows are pure markup.

### Trip visibility semantics

- **`private`** — only members can see the trip exists. **Default for new trips** (column default in the migration). `trips_select_*` predicate: `exists (select 1 from trip_members ...)`.
- **`unlisted`** — anyone with a direct link (i.e. anyone who knows the trip's UUID) can see the trip exists, but it does not appear in the explore tab. `trips_select_*` predicate: same as `public` (knowing the id is the gate). Explore (s3a.11) filters explicitly to `visibility = 'public'`, so unlisted trips never appear there.
- **`public`** — appears in explore (s3a.11), accepts join requests (s3a.12, approval-required by default). World-readable trip metadata; **never** money. `trips_select_*` predicate: `true` (predicate already gated on `visibility = 'public'` branch in the policy).

### `trip_members` role

- **Binary at MVP: `organizer` | `member`.** Document this in the column comment; do not introduce more roles unless the AC explicitly needs them. The existing AC does not. Future "viewer" or "co-organizer" roles would land via an enum extension in a new migration.
- Exactly one organizer per trip is enforced by a **partial unique index** `create unique index trip_members_one_organizer_per_trip on trip_members (trip_id) where role = 'organizer'`. If/when co-organizer becomes a thing, that index goes away in the new migration.

### Money-privacy hard rule in this chunk

- The new `trips_select_*` policies must NOT include any monetary join. They don't.
- The new `trip_members_select_*` policies must NOT expose membership to non-members of the trip — even on `public` trips, the membership list is members-only. The s3a.11 explore tab will surface "X people are going" as an aggregate count via a separate query (or a denormalized column on `trips`), never by exposing individual member rows. Sketched here as a constraint on s3a.11, not implemented in this chunk.
- Monetary tables, when they ship (Beads under the payments epic, not in `s3a`), will have their own member-only RLS policies. The trip-visibility model does not relax them and never will. Documented in the migration's threat-model header.

### Threat model (per `.cursor/skills/project-architecture/SKILL.md` template)

1. **Who can READ `trips`?**
   - **Anonymous + authenticated**: rows where `visibility = 'public'`, OR rows where the caller is a `trip_members` row.
   - **Anonymous trying to read a `private` trip** → 0 rows (RLS).
   - **Authenticated non-member trying to read a `private` trip** → 0 rows (RLS).
   - **Authenticated non-member trying to read an `unlisted` trip without the link** → 0 rows in a list query; `getTripById(unlistedId)` succeeds because knowing the id is the gate. This is the intentional `unlisted` semantic. (See open decision below.)
   - **Authenticated non-member trying to read a `public` trip** → 1 row (RLS).
2. **Who can READ `trip_members`?**
   - **Members of the trip only.** Even on a `public` trip, the membership list is members-only; the explore tab surfaces an aggregate count, not individuals.
3. **Who can WRITE `trips`?**
   - **INSERT**: not in this chunk's UI surface. The migration ships the policy nonetheless, scoped to `auth.uid() = organizer_id` so `s3a.26`'s create flow has the policy waiting. Server Actions in `s3a.26` will set `organizer_id = auth.uid()` and insert the matching `trip_members` row in the same transaction.
   - **UPDATE**: only the organizer (`auth.uid() = organizer_id`). Members can't rename the trip or change its visibility. The `update` policy uses both `using` and `with check` keyed to `organizer_id`.
   - **DELETE**: only the organizer. `on delete cascade` from `trip_members` and (future) `posts` / `expenses`.
4. **Who can WRITE `trip_members`?**
   - **INSERT**: the organizer of the trip can add members; a profile can insert a row for themselves where `role = 'member'` only when the trip is `public` (open join → still gated by `s3a.12`'s approval flow once that lands; for now, only the organizer can add members, and self-join is OUT). Self-join is intentionally OUT — `s3a.12` owns join requests; this chunk only ships the substrate.
   - **DELETE**: a member can delete their own membership (== leave); the organizer can delete any non-organizer membership (== remove). Organizer cannot delete their own membership row (CHECK + RLS combination — see "Open decisions" for the exact mechanism).
   - **UPDATE**: not allowed at MVP. Role changes (`member` → `organizer` transfer) are a separate, deliberate flow that lands when needed.
5. **What if someone outside that set sends the request anyway?**
   - SELECT outside the visibility branch returns 0 rows.
   - INSERT / UPDATE / DELETE outside the policy is rejected by RLS.
6. **Logs / PII?**
   - `trips`: name, optional description, optional dates, organizer FK, visibility, timestamps. No money. No PII beyond what's already in `profiles`.
   - `trip_members`: two FKs + role + timestamp. No PII beyond what's in `profiles`.
7. **Block check on trip read policies — application-level, NOT in RLS.**
   - **Recommendation:** keep the block check at the read-side helpers in `lib/trips.ts` (mirrors the `lib/profiles.ts` `excludeIds` pattern from `s3a.16`). Reasons:
     - RLS readability: putting a `not exists (select 1 from blocks ...)` branch into every `trips_select_*` policy makes the SQL noisy and harder to audit.
     - Performance: the block check is rare (most trips aren't authored by someone who blocks the viewer); paying for it on every row of every read is wasteful.
     - Symmetry with the already-shipped pattern: `app/page.tsx` already calls `getBlockedProfileIds(profile.id)` once and passes the array down to filtered helpers. `listTripsForViewer` doesn't need the filter (the viewer is a member of the trips it returns — they can already see the organizer), but `s3a.11`'s explore listing will. The explore-side helper will accept the same `excludeIds` opt.
   - **Honest deferral:** the block check on the explore-side `trips` listing is `s3a.11`'s territory; this chunk doesn't need to ship it. Mirroring note appended to `s3a.11`.
   - **See "Open decisions" for the alternative (RLS-side) and why we're not picking it.**
8. **DM-side reuse.** The shared-trip leg of `can_dm()` in `s3a.13` queries `trip_members`. Note already on `s3a.13`; nothing for this chunk to do beyond shipping the table.

## 4. Schema sketch

### Migration header

The migration starts with a header threat-model comment block following the same shape as `s3a.16`'s migration header. Key statements (paraphrased):

- **Money-privacy hard rule:** money data is never readable by non-trip-members regardless of visibility. The `trips_select_*` policies in this migration expose trip metadata only and make no reference to monetary tables. Future monetary tables get their own member-only RLS policies; the visibility model does not relax them.
- **Migration immutability:** the historical `20260419013009_profiles.sql` (s3a.1) and `20260419045026_follows.sql` (s3a.2) migrations are intentionally NOT edited. The deferred co-trip-members branch on `profiles_select_discoverable_or_self` is closed at the database level via a `drop policy / create policy` block in this migration. Same pattern `s3a.16` used to close the s3a.2 block-check seam.
- **Seam closed:** the co-trip-members branch deferred from s3a.1 (and re-deferred in s3a.2's drop-and-recreate). After this migration, that policy reads `is_discoverable = true OR auth.uid() = id OR exists (...follows...) OR exists (...co-trip-members...)`.
- **Open consumers (deferred to follow-up Beads):**
  - `posts` (`s3a.7`) — visibility join.
  - `comments` + `reactions` (`s3a.8`) — same.
  - `join_requests` (`s3a.12`) — `trip_id` FK + `auto_approve` column lives there.
  - `dm_messages` (`s3a.13`) — `can_dm()` queries `trip_members`.
  - Block check on trip READ policies — kept at the application layer (see threat-model #7).

### `trip_visibility` enum

```sql
create type trip_visibility as enum ('private', 'unlisted', 'public');
```

### `trip_member_role` enum

```sql
create type trip_member_role as enum ('organizer', 'member');
```

### `trips` table

| column        | type                                | NOT NULL | default              | notes                                                                                                                                          |
|---------------|-------------------------------------|----------|----------------------|------------------------------------------------------------------------------------------------------------------------------------------------|
| `id`          | `uuid`                              | yes      | `gen_random_uuid()`  | PK.                                                                                                                                            |
| `organizer_id`| `uuid`                              | yes      | —                    | FK -> `public.profiles(id) on delete restrict`. `restrict` because deleting an organizer profile while they own trips is a state we should refuse — force an explicit transfer first. |
| `name`        | `text`                              | yes      | —                    | CHECK `length(name) between 1 and 120`.                                                                                                        |
| `description` | `text`                              | no       | `null`               | CHECK `description is null or length(description) <= 2000`. Optional. (See "Open decisions" — recommend ship now to avoid a second migration.) |
| `start_date`  | `date`                              | no       | `null`               | Nullable on purpose — "I don't know yet" trips are real (see "Open decisions").                                                                |
| `end_date`    | `date`                              | no       | `null`               | Nullable. CHECK `end_date is null or start_date is null or end_date >= start_date`.                                                            |
| `visibility`  | `trip_visibility`                   | yes      | `'private'`          | The whole point of this chunk.                                                                                                                 |
| `created_at`  | `timestamptz`                       | yes      | `now()`              |                                                                                                                                                |
| `updated_at`  | `timestamptz`                       | yes      | `now()`              | Maintained by the existing `public.set_updated_at()` trigger function from `s3a.1`.                                                            |

```sql
create table public.trips (
  id           uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles(id) on delete restrict,
  name         text not null check (length(name) between 1 and 120),
  description  text check (description is null or length(description) <= 2000),
  start_date   date,
  end_date     date,
  visibility   trip_visibility not null default 'private',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create trigger trips_set_updated_at
  before update on public.trips
  for each row execute function public.set_updated_at();

comment on table public.trips is
  'Trip entity. visibility ∈ (private | unlisted | public) — see ADR 0002. Money data is NEVER readable by non-members regardless of visibility (supabase-security.mdc hard rule).';

create index trips_visibility_public_idx
  on public.trips (visibility) where visibility = 'public';
create index trips_organizer_id_idx
  on public.trips (organizer_id);
create index trips_created_at_idx
  on public.trips (created_at desc);
```

#### `trips` RLS

```sql
alter table public.trips enable row level security;

-- SELECT: public trips are world-readable; private + unlisted require membership
-- (knowing the id of an unlisted trip is the gate — getTripById succeeds; list
-- queries return 0 rows for unlisted trips the caller isn't a member of).
create policy "trips_select_visible"
  on public.trips
  for select
  to authenticated, anon
  using (
    visibility in ('public', 'unlisted')
    or exists (
      select 1 from public.trip_members tm
      where tm.trip_id = trips.id
        and tm.profile_id = auth.uid()
    )
  );
```

> **Note on `unlisted` in the `select` predicate above.** The policy returns `unlisted` rows to anyone, but list queries (`select * from trips`) return 0 unlisted rows to non-members because callers don't know the ids. The explore-tab query (`s3a.11`) explicitly filters `where visibility = 'public'`, so unlisted trips don't leak there. `getTripById(unlistedId)` succeeds by design — that's the `unlisted` semantic. See "Open decisions" for the alternative (`share_token`) and why we're not picking it.

```sql
-- INSERT: only the caller can create a trip with themselves as organizer.
-- Read this policy as the substrate s3a.26 will lean on; no UI in this chunk.
create policy "trips_insert_organizer_self"
  on public.trips
  for insert
  to authenticated
  with check (auth.uid() = organizer_id);

-- UPDATE: only the organizer can change anything (name, description, dates,
-- visibility). Members cannot rename or flip visibility.
create policy "trips_update_organizer"
  on public.trips
  for update
  to authenticated
  using (auth.uid() = organizer_id)
  with check (auth.uid() = organizer_id);

-- DELETE: only the organizer.
create policy "trips_delete_organizer"
  on public.trips
  for delete
  to authenticated
  using (auth.uid() = organizer_id);
```

### `trip_members` table

| column        | type                                | NOT NULL | default              | notes                                                                                                              |
|---------------|-------------------------------------|----------|----------------------|--------------------------------------------------------------------------------------------------------------------|
| `trip_id`     | `uuid`                              | yes      | —                    | FK -> `public.trips(id) on delete cascade`. Part of the composite PK.                                              |
| `profile_id`  | `uuid`                              | yes      | —                    | FK -> `public.profiles(id) on delete cascade`. Part of the composite PK.                                           |
| `role`        | `trip_member_role`                  | yes      | `'member'`           | `'organizer'` | `'member'`. Binary at MVP.                                                                       |
| `joined_at`   | `timestamptz`                       | yes      | `now()`              |                                                                                                                    |

```sql
create table public.trip_members (
  trip_id    uuid not null references public.trips(id)    on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role       trip_member_role not null default 'member',
  joined_at  timestamptz not null default now(),
  primary key (trip_id, profile_id)
);

comment on table public.trip_members is
  'Trip membership. role ∈ (organizer | member) at MVP. Membership grants read on trip-derived content (posts, etc.) per their own visibility branches. Money tables grant read on membership ALONE — never on trips.visibility.';

-- Exactly one organizer per trip at MVP. If co-organizer ever lands, this
-- partial unique index goes away in the new migration.
create unique index trip_members_one_organizer_per_trip
  on public.trip_members (trip_id) where role = 'organizer';

-- Reverse-direction lookup: "what trips is this profile in?". The PK already
-- covers (trip_id, ...) for "who's in this trip?".
create index trip_members_profile_id_idx
  on public.trip_members (profile_id);
```

#### `trip_members` RLS

```sql
alter table public.trip_members enable row level security;

-- SELECT: members of the trip can see all members of the same trip. Non-members
-- get zero rows — even on a public trip. Explore tab surfaces aggregate count
-- via a separate denormalized path (s3a.11), not by exposing individuals.
create policy "trip_members_select_co_members"
  on public.trip_members
  for select
  to authenticated
  using (
    exists (
      select 1 from public.trip_members self
      where self.trip_id = trip_members.trip_id
        and self.profile_id = auth.uid()
    )
  );

-- INSERT: the organizer can add members to their own trip. Self-join (a
-- non-member adding themselves) is OUT in this chunk — s3a.12 owns the
-- join-request flow. The bootstrap insert (organizer's own trip_members row
-- when the trip is created) lands in s3a.26 inside the same transaction as
-- the trips insert, and is allowed by this policy because the caller IS the
-- organizer of the just-created trip.
create policy "trip_members_insert_by_organizer"
  on public.trip_members
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.trips t
      where t.id = trip_members.trip_id
        and t.organizer_id = auth.uid()
    )
  );

-- DELETE: a member can remove themselves (== leave); the organizer can remove
-- a non-organizer member (== remove). The organizer CANNOT delete their own
-- organizer row — they must transfer organizer first (separate flow). The
-- second clause encodes "you're the trip's organizer AND the row you're
-- deleting is not the organizer row".
create policy "trip_members_delete_self_or_by_organizer"
  on public.trip_members
  for delete
  to authenticated
  using (
    (
      profile_id = auth.uid()
      and role <> 'organizer'
    )
    or
    (
      role <> 'organizer'
      and exists (
        select 1 from public.trips t
        where t.id = trip_members.trip_id
          and t.organizer_id = auth.uid()
      )
    )
  );

-- No UPDATE policy. Role changes are a deliberate flow (transfer organizer)
-- that lands when needed; not at MVP.
```

### Drop-and-recreate `profiles_select_discoverable_or_self` (closes the co-trip-members branch deferred from s3a.1)

```sql
-- ----------------------------------------------------------------------------
-- profiles_select_discoverable_or_self: extend with the co-trip-members branch
--
-- The s3a.1 migration shipped this policy without the co-trip-members branch
-- because trip_members didn't exist yet. The s3a.2 migration drop-and-
-- recreated it adding the follower branch but left the co-trip-members
-- branch deferred (header of 20260419013009_profiles.sql + tail of
-- 20260419045026_follows.sql both record this). Now that trip_members exists,
-- drop and recreate a second time to wire the third branch.
--
-- The historical 20260419013009_profiles.sql and 20260419045026_follows.sql
-- migrations are intentionally NOT modified — applied migrations are immutable
-- (Supabase tracks each by file hash). This drop-and-recreate supersedes the
-- historical policy at the database level. Same pattern as
-- 20260419050000_blocks_mutes.sql (s3a.16) used to close the s3a.2 block-check
-- seam.
-- ----------------------------------------------------------------------------

drop policy "profiles_select_discoverable_or_self" on public.profiles;

create policy "profiles_select_discoverable_or_self"
  on public.profiles
  for select
  to authenticated, anon
  using (
    is_discoverable = true
    or auth.uid() = id
    or exists (
      select 1 from public.follows
      where follower_id = auth.uid()
        and followee_id = profiles.id
    )
    or exists (
      select 1
      from public.trip_members viewer_tm
      join public.trip_members other_tm
        on viewer_tm.trip_id = other_tm.trip_id
      where viewer_tm.profile_id = auth.uid()
        and other_tm.profile_id = profiles.id
    )
  );
```

## 5. Helpers — `lib/trips.ts`

Server-only module. Mirrors the JSDoc + result-shape conventions in `lib/follows.ts` and `lib/blocks.ts`.

```ts
import "server-only";

import type { Database } from "@/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-only Trip read helpers (Bead tripplanner-s3a.3). No write helpers in
 * this chunk — trip create lands in tripplanner-s3a.26.
 *
 * Why server-only: helpers issue authenticated Supabase calls under the
 * caller's session cookie; RLS still applies. Pulling into the browser would
 * require the secret key (forbidden) or re-implementing RLS in the client
 * (worse). See .cursor/rules/supabase-security.mdc.
 */

export type TripVisibility = Database["public"]["Enums"]["trip_visibility"];
export type TripMemberRole = Database["public"]["Enums"]["trip_member_role"];
export type Trip = Database["public"]["Tables"]["trips"]["Row"];
export type TripMember = Database["public"]["Tables"]["trip_members"]["Row"];

export type TripWithMemberCount = Trip & { memberCount: number };

export type GetTripResult =
  | { ok: true; trip: Trip }
  | { ok: false; error: "not_found" | "unauthorized" | "unknown" };

/** List trips the viewer is a member of, most recent first. */
export async function listTripsForViewer(
  viewerId: string,
  opts?: { limit?: number },
): Promise<TripWithMemberCount[]>;

/** Single-trip read; respects RLS so private trips return null for non-members. */
export async function getTripById(tripId: string): Promise<Trip | null>;

/** Members of a trip the viewer can see; returns [] if the viewer is not a member. */
export async function getTripMembers(tripId: string): Promise<TripMember[]>;

/** Membership existence check used by future modules (e.g. can_dm shared-trip leg). */
export async function isTripMember(
  tripId: string,
  profileId: string,
): Promise<boolean>;
```

### Implementation notes

- **`listTripsForViewer`**: two-step query, mirrors `lib/profiles.ts` `listDiscoverableProfilesExcluding`:
  1. `select trip_id from trip_members where profile_id = viewerId`. RLS-filtered.
  2. `select * from trips where id in (...)` ordered by `created_at desc`, `limit` (default 20, callers can pass 5 for the home-page slice).
  3. Member counts: a single `select trip_id, count(*) from trip_members where trip_id in (...) group by trip_id` aggregation; merge into the trip rows in TS. Cheap at MVP volumes (single-digit trips per user); avoids inventing an RPC. If/when a user is in hundreds of trips, swap to a denormalized `trips.member_count` column maintained by triggers (file as a follow-up).
- **`getTripById`**: `from('trips').select('*').eq('id', tripId).maybeSingle()`. RLS does the heavy lifting — non-members of private trips get `null` naturally.
- **`getTripMembers`**: `from('trip_members').select('*').eq('trip_id', tripId)`. RLS filters to co-members only.
- **`isTripMember`**: `head: true, count: 'exact'` existence check filtered on `(trip_id, profile_id)`. Same shape as `isFollowing` in `lib/follows.ts`.
- **PG-error-code map** (consistent with `lib/follows.ts` / `lib/blocks.ts`):
  - `23505 -> already_member` (for future write helpers in s3a.26).
  - `23503 -> trip_not_found` or `profile_not_found` depending on the failing FK.
  - `23514 -> invalid_input` (CHECK violations on name length, date order).
  - Anything else: log `error.code, error.message`, return `unknown`.
- **No `Database` augmentation needed at code-write time** — the parent agent regenerates `database.types.ts` after `supabase db push` (orchestration step), so by the time `lib/trips.ts` is committed, `Database["public"]["Tables"]["trips"]["Row"]` and `Database["public"]["Enums"]["trip_visibility"]` already exist. (This chunk is the only DB-touching chunk in this batch — no parallel-chunk type-collision risk.)

## 6. UI surface in this chunk — minimal end-to-end slice

Section on `app/page.tsx`, signed-in only and **only when a profile exists** (after `requireProfile()`). Sandwiched between the existing follower-counts strip and the existing `People to follow` section.

### Data fetching

Extend the existing `Promise.all`:

```tsx
const [counts, discoverable, trips] = await Promise.all([
  getFollowCounts(profile.id),
  listDiscoverableProfilesExcluding(profile.id, 10, { excludeIds: blockedIds }),
  listTripsForViewer(profile.id, { limit: 5 }),
]);
```

### Layout

- Wrap in `<section aria-labelledby="your-trips" className="flex flex-col gap-4">` with an `<h2 id="your-trips" className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">Your trips</h2>` heading — same shape as the existing `People to follow` heading.
- Same `bg-card border border-hairline` rounded-row pattern as the discover cards. No new design tokens.
- Each row (`<li>` inside `<ul className="flex flex-col gap-3">`):
  - **Trip name** in `font-display text-base leading-tight truncate`. Fraunces — content-mode protagonist.
  - **Trip dates** in `text-sm text-secondary` (Inter). Format using `Intl.DateTimeFormat` with a graceful fallback for null dates ("Dates TBD").
  - **Member count** in `font-mono text-xs text-secondary tabular-nums` — small, factual, not a CTA. Format: `{n} {n === 1 ? 'member' : 'members'}`.
  - **Visibility chip** — small uppercase pill on the right edge. Color-coded with **existing tokens only** (no new tokens): `Private` -> `bg-paper border border-hairline text-secondary`, `Unlisted` -> `bg-card border border-hairline text-ink`, `Public` -> `bg-ember/10 border border-ember/30 text-ink` (uses the existing `--color-ember` accent at low opacity — no new color, just an opacity variant). All three pills get `font-mono text-[10px] uppercase tracking-[0.15em] px-2 py-1 rounded`. Tap-/hover-target irrelevant since rows are non-link in this chunk.
- **Tap targets >= 44px** on mobile: each `<li>` has `min-h-[44px]` (`p-3` already gives ~48px height with content).
- **No client component**: rows are pure markup. No `FollowButton`/`BlockLink`-style interactions in this chunk.
- **`aria-live`**: not needed (no client mutations).

### Empty state

When `trips.length === 0`, render warm copy. Sample (do NOT use the verb "jettison"):

```tsx
<p className="text-sm text-secondary text-center py-6">
  No trips yet — trip creation is on the way. When it lands, your trips will appear here.
</p>
```

The empty state matches the existing `People to follow` empty-state shape (`text-sm text-secondary text-center py-6`).

### Honest limitation (called out, not hidden)

**Rows are non-link `<div>`s in this chunk.** Clicking them does nothing. Reasoning: the trip detail page lives in `s3a.26` (filed below). A `<Link href="/trips/{id}" />` to a non-existent route would render as a 404 destination, which is uglier than a non-link row. Once `s3a.26` lands, these rows become real links.

This is the s3a.2 lesson applied honestly: **smallest end-to-end slice that exercises the new substrate** (the substrate IS exercised — `listTripsForViewer` runs against real RLS, the home page renders real trip names, the visibility chip proves the enum landed) without faking destinations that don't exist.

### Brand voice + accessibility

- "Jettison" only as a proper noun (already in the existing header). Never as a verb.
- No emojis, no exclamation marks.
- Headings preserve the outline (`<h1>` is the `Hello, {display_name}` greeting; `<h2>` is the new `Your trips` and the existing `People to follow`).
- Focus order is reading order; no skips.
- Color-independence on the visibility chip: each pill carries its own visible label (`Private` / `Unlisted` / `Public`), so meaning is not communicated by color alone.

## 7. Verification

Before reporting back to the parent agent (subagent stops here per the parallel-chunks contract):

- [ ] `pnpm tsc --noEmit` — exit 0.
- [ ] `pnpm lint` — exit 0.
- [ ] `ReadLints` clean on every touched file (`supabase/migrations/20260419190100_trips_visibility.sql` won't lint, but `lib/trips.ts` and `app/page.tsx` will).
- [ ] **Boundary `rg`** (per `tasks/lessons.md` 2026-04-17): `rg 'SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|sb_secret_' app/ lib/ proxy.ts` — only doc-comment matches. `lib/trips.ts` is read-only and uses the cookie-bound `createClient` from `@/lib/supabase/server`; no service-role key.
- [ ] **Money-privacy `rg`** (positive): `rg 'expenses|expense_shares|payouts|amount\b|currency\b' supabase/migrations/20260419190100_trips_visibility.sql` — **must return zero matches**. The migration body never references monetary tables or columns.
- [ ] **Money-privacy `rg`** (negative): `rg 'trips' supabase/migrations/` — only the new file matches (no historical migration leaks the trips table early).
- [ ] **Seam-closure `rg`**: `rg 'co-trip-members branch deferred' supabase/migrations/` — should return only the historical references in `20260419013009_profiles.sql` and `20260419045026_follows.sql` (the seam markers stay in place; the new migration's drop-and-recreate supersedes at the DB level).
- [ ] **Migration-immutability `rg`**: `git diff HEAD -- supabase/migrations/20260418234709_profiles.sql supabase/migrations/20260419013009_profiles.sql supabase/migrations/20260419045026_follows.sql supabase/migrations/20260419050000_blocks_mutes.sql supabase/migrations/20260419050100_rate_limits.sql` — must show **zero** changes. (Note: `20260418234709_profiles.sql` is in the prompt's reading list but does not exist in this repo's `supabase/migrations/` — only `20260419013009_profiles.sql` does. Flagged in the final report.)

### Smoke-test SQL (parent agent runs this after `supabase db push`)

```sql
-- As user A: insert a private trip with self as organizer.
-- (Replace <USER_A_UUID> / <USER_B_UUID> with real auth.users ids.)
insert into public.trips (organizer_id, name, visibility)
values ('<USER_A_UUID>', 'Smoke test private', 'private')
returning id;
-- => returns <T1>

insert into public.trip_members (trip_id, profile_id, role)
values ('<T1>', '<USER_A_UUID>', 'organizer');

-- As user B (no membership), select the private trip:
set role authenticated;
set local "request.jwt.claims" to '{"sub":"<USER_B_UUID>","role":"authenticated"}';
select * from public.trips where id = '<T1>';
-- => 0 rows (RLS).

-- Flip to public:
reset role;
update public.trips set visibility = 'public' where id = '<T1>';

-- As user B again:
set role authenticated;
set local "request.jwt.claims" to '{"sub":"<USER_B_UUID>","role":"authenticated"}';
select * from public.trips where id = '<T1>';
-- => 1 row.

-- As user B (still non-member): try to update the trip's visibility:
update public.trips set visibility = 'private' where id = '<T1>';
-- => 0 rows updated (RLS denies).

-- As user A: add user B as a member.
reset role;
insert into public.trip_members (trip_id, profile_id, role)
values ('<T1>', '<USER_B_UUID>', 'member');

-- As user B (now a member): try again to update visibility — still denies.
set role authenticated;
set local "request.jwt.claims" to '{"sub":"<USER_B_UUID>","role":"authenticated"}';
update public.trips set visibility = 'private' where id = '<T1>';
-- => 0 rows updated (only organizer can update).

-- As user B: try to add another member — must fail (only organizer can insert).
insert into public.trip_members (trip_id, profile_id, role)
values ('<T1>', '<SOME_OTHER_UUID>', 'member');
-- => RLS denies the insert.

-- As user B: leave the trip (delete own membership) — succeeds.
delete from public.trip_members
where trip_id = '<T1>' and profile_id = '<USER_B_UUID>';
-- => 1 row deleted.
```

### HTTP smoke

- Anonymous `curl GET /` -> 200 (the AnonymousWelcome path; no `Your trips` section rendered).
- Signed-in render shows the new section. Manual visual check + `curl HTML | grep -i 'your trips'` (after authenticating via the dev server's cookie) returns the section header.

## 8. Bead bookkeeping (parent agent does this after subagent reports back)

### Create

- **`tripplanner-s3a.26`** — `feat: trip create flow + trip detail page` — P1, parent `tripplanner-s3a`, `--blocked-by tripplanner-s3a.3`, `--discovered-from tripplanner-s3a.3`. Sketch AC (full AC drafted in s3a.26 itself):
  - Organizer can create a trip with `name` (required, 1..120 chars), optional `description`, optional `start_date` / `end_date`, default `visibility = 'private'`.
  - Server Action validates input, sets `organizer_id = auth.uid()`, inserts the `trips` row AND the matching `trip_members` row with `role = 'organizer'` in the same transaction.
  - Trip detail page at `/trips/[id]`. Reuses the visibility chip from `app/page.tsx`. Member-list reveal respects RLS (members visible only to other members).
  - Home-page rows from this chunk become real `<Link href="/trips/{id}" />` after this Bead lands.
  - Includes a `lib/trips.ts` write-helper addition (`createTrip`, `updateTripVisibility`, `leaveTrip`) and a new `app/_actions/trips-actions.ts`.

### Append notes (mirroring contract — append, never overwrite)

- **`tripplanner-s3a.7` (Posts):**
  > 2026-04-19 — When this Bead lands, the `posts` table's select policy must join to `trips.visibility` for the visibility branch (`exists (select 1 from trips t where t.id = posts.trip_id and (t.visibility = 'public' or exists (select 1 from trip_members tm where tm.trip_id = t.id and tm.profile_id = auth.uid())))`) AND to `images.state = 'approved'` for the pre-moderation branch. Pending posts visible only to the author. The `trips` + `trip_members` substrate this requires shipped in `tripplanner-s3a.3` (migration `20260419190100_trips_visibility.sql`).
- **`tripplanner-s3a.10` (followers feed):**
  > 2026-04-19 — When this Bead lands, the feed query must respect Trip visibility + membership (only Posts in trips the viewer can see — same join shape s3a.7's policy uses) **plus** the existing mute filter from the s3a.16 note above. The trip-visibility substrate shipped in `tripplanner-s3a.3`.
- **`tripplanner-s3a.11` (explore tab):**
  > 2026-04-19 — When this Bead lands, the explore query is `select ... from trips where visibility = 'public' and exists (... at least one approved photo ...)`. Reuses the `listTripsForViewer` row-shape pattern from `lib/trips.ts` (shipped in `tripplanner-s3a.3`) but unauthenticated. The block check on the explore-side trip listing belongs here at the application layer (mirrors the `excludeIds` pattern from `lib/profiles.ts` s3a.16). Aggregate "X people are going" count comes from a separate query / denormalized column on `trips`, NEVER by exposing individual `trip_members` rows.
- **`tripplanner-s3a.12` (join requests):**
  > 2026-04-19 — When this Bead lands, the `join_requests` table needs `trip_id` (FK to `trips.id`) + `from_profile_id` (FK to `profiles.id`) + state enum. Trip `visibility = 'public'` is the gate that opens the join-request affordance in the UI; shared `unlisted` may also open it (decision in this Bead). The `auto_approve` boolean column on `trips` belongs in this Bead's migration, NOT in `s3a.3`'s — it's a join-request-behavior toggle, not a visibility concept. The trip + trip_members substrate shipped in `tripplanner-s3a.3`.
- **`tripplanner-s3a.13` (DMs):**
  > 2026-04-19 — When this Bead lands, the `can_dm()` SQL function's "shared trip" leg queries `trip_members` (table shipped in `tripplanner-s3a.3`'s migration `20260419190100_trips_visibility.sql`). Already noted on this Bead from earlier; this is the substrate-shipped confirmation.

### Close

- **`tripplanner-s3a.3`** — close note (parent agent fills in after subagent reports + orchestration completes):
  > Shipped: `trip_visibility` enum + `trip_member_role` enum + `trips` table + `trip_members` table (composite PK + binary role + partial unique index for one-organizer-per-trip + indexes on every RLS-predicate column) + visibility-aware select policies + organizer-only update/delete on trips + organizer-or-self-leave delete on trip_members + organizer-only insert on trip_members + drop-and-recreate of `profiles_select_discoverable_or_self` adding the co-trip-members branch (closes the seam from `s3a.1`/`s3a.2` at the database level — historical migrations left untouched per migration-immutability discipline) + `lib/trips.ts` (server-only: `listTripsForViewer` / `getTripById` / `getTripMembers` / `isTripMember`) + minimal end-to-end home-page UI (`Your trips` section between the follower-counts strip and the People-to-follow section, signed-in only, read-only rows with visibility chips). Migration: `supabase/migrations/20260419190100_trips_visibility.sql`. Pushed to linked Supabase project. `database.types.ts` regenerated. Trip create + trip detail page deferred to `tripplanner-s3a.26` (new follow-up, blocked-by this Bead). Posts/comments/reactions visibility branch deferred to their own Beads (`s3a.7`, `s3a.8`) per the substrate-and-its-consumer split. Money-privacy hard rule preserved: zero monetary-table references in this migration; verified by negative `rg`.

## 9. File-scope contract for the implementation subagent

### OWNS — files this chunk's subagent may create or modify

- `supabase/migrations/20260419190100_trips_visibility.sql` (NEW — pre-allocated timestamp by the parent agent).
- `lib/trips.ts` (NEW).
- `app/page.tsx` (MODIFY — additive only; extend the existing `Promise.all` to add the trips fetch, render one new `<section>` between the follower-counts strip and the `People to follow` section. Do NOT touch the discover-card section, the FollowButton/BlockLink wiring, the AnonymousWelcome path, or the sample-balance section.)

### MUST NOT TOUCH — exhaustive

- **Every existing migration:**
  - `supabase/migrations/20260419013009_profiles.sql`
  - `supabase/migrations/20260419045026_follows.sql`
  - `supabase/migrations/20260419050000_blocks_mutes.sql`
  - `supabase/migrations/20260419050100_rate_limits.sql`
  - (No `20260418234709_profiles.sql` exists in this repo — see "Risks and open decisions" #6.)
- **Every other `lib/*.ts`:**
  - `lib/follows.ts`
  - `lib/blocks.ts`
  - `lib/profiles.ts`
  - `lib/rate-limit.ts`
  - `lib/supabase/{server,client,middleware}.ts`
- **`app/_actions/*.ts`:**
  - `app/_actions/blocks-actions.ts`
  - `app/_actions/follows-actions.ts`
  - (No `app/_actions/trips-actions.ts` is created in this chunk — write paths land in `s3a.26`.)
- **`app/_components/*.tsx`:**
  - `app/_components/follow-button.tsx`
  - `app/_components/block-link.tsx`
  - `app/_components/footer.tsx`
- **`app/onboarding/**`** (s3a.24's territory if any work runs there in this batch).
- **`app/legal/**`** (s3a.17's territory).
- **`app/layout.tsx`**, **`app/globals.css`**, **`app/auth/**`** — not relevant to this chunk.
- **`database.types.ts`** — parent agent regenerates after `supabase db push --linked`.
- **`tasks/todo.md`** and **`tasks/lessons.md`** — parent agent owns the session ritual.
- **`proxy.ts`**, **`AGENTS.md`**, **`.cursor/**`**, **`docs/**`**, **`README.md`** — out of scope.
- **`.beads/**`** — parent agent runs `bd create` / `bd update` / `bd close`.

### Stop-before-orchestration rule (per `project-orchestration` skill "Parallel chunks" #3)

The subagent **stops** after:
- Writing the migration file.
- Writing `lib/trips.ts`.
- Modifying `app/page.tsx`.
- Running local `pnpm tsc --noEmit` + `pnpm lint` + `ReadLints` + the verification `rg` sweeps.
- Drafting the commit message body and listing changed files.

The subagent does **NOT**:
- Run `supabase db push` (parent agent sequences this).
- Run `supabase gen types typescript --linked > database.types.ts` (parent agent runs this once after the push).
- Run `bd create` / `bd update` / `bd close` (parent agent owns Bead bookkeeping).
- Create a git commit (parent agent commits in dependency order after every subagent reports back — this chunk is the only DB-touching chunk in the batch, so it's a single commit if there are no other parallel chunks).

If the subagent discovers a conflict or surprise mid-implementation (e.g. a column name collides with something it didn't expect), it **stops and reports** rather than improvising — same discipline as `s3a.16` reverting its accidental edit to the historical follows migration.

## 10. Risks and open decisions

1. **Block check on trip read policies — RLS-side vs application-side.** Recommendation: **application-side**, in the read helpers in `lib/trips.ts` (and especially in `s3a.11`'s explore-side helper) via the same `excludeIds` opt pattern as `lib/profiles.ts` from `s3a.16`. Rationale: RLS readability (the `trips_select_visible` policy stays a clean two-branch predicate); performance (block is rare, paying for the check on every row of every read is wasteful); pattern symmetry. The trade-off: an attacker who reads the raw SQL can see that `trips_select_visible` doesn't reference `blocks` and might assume blocks don't apply — but the helpers always apply the filter, and the policy gives no information beyond visibility. The RLS-side alternative is `+ and not exists (select 1 from blocks where ...)` on the public branch only; defer to a follow-up Bead if the application-side filter ever proves insufficient. **For this chunk: nothing to ship — `listTripsForViewer` returns trips the viewer is a member of, and a member-of relationship already implies the viewer can see the organizer; the block check is `s3a.11`'s problem.**
2. **`unlisted` semantics — UUID-as-gate vs separate `share_token`.** Recommendation: **UUID is the gate** at MVP. UUIDv4 is unguessable (122 bits of entropy); maintaining a separate token would add a column, an index, a rotation surface, and a UI for rotation — none of which the AC asks for. If/when "rotate the share link to revoke access without deleting the trip" becomes a real requirement, file it as a follow-up Bead and add `share_token uuid` then. Documented in the migration header.
3. **Trip dates — nullable vs required.** Recommendation: **both nullable**. "I don't know yet" trips are a real product state (someone planning a vague summer Europe trip). Adding the columns as `not null` at MVP would either force fake placeholder dates or block trip creation until dates are known. CHECK constraint `end_date is null or start_date is null or end_date >= start_date` keeps the order honest when both are present.
4. **Currency on trips.** Confirmed **OUT** of this chunk. Trips don't carry a currency until expenses land. The future `expenses` table will own currency at the per-expense grain (allowing multi-currency trips later — not at MVP, but the schema doesn't preclude it).
5. **Optional `description` on trips in this chunk.** Recommendation: **add now** (cheap; avoids a second migration + a `database.types.ts` regen later when `s3a.26` would otherwise add it). CHECK constraint `description is null or length(description) <= 2000`. If the user wants to keep the substrate strictly minimal, this is the easiest column to drop.
6. **The prompt's reading-list mentions `20260418234709_profiles.sql` — that file does not exist in this repo.** Only `20260419013009_profiles.sql` does. Flagged in the final report so the parent agent can confirm there's no parallel chunk in flight that's about to create that timestamp (`20260418234709` would sort BEFORE the existing profiles migration, which would be very strange). Treating this as a typo in the prompt and proceeding against the migrations that actually exist.
7. **Pre-allocated migration timestamp `20260419190100`.** Picked to slot AFTER all currently-applied migrations (`20260419050100_rate_limits.sql` is the latest) by a comfortable margin. If the parent agent is launching other DB-touching chunks in parallel this session, it should pre-allocate a strictly-greater timestamp for them per the `project-orchestration` "Parallel chunks" #2 rule. **Final report flags this as the one parallel-chunks contract item the parent agent must adjudicate.**
8. **`trip_members_one_organizer_per_trip` partial unique index.** Encoded here because the AC implies a single organizer; if co-organizer ever lands, that index goes away in the new migration (and `trip_members_delete_self_or_by_organizer` would need to allow more than one organizer-role row to exist before the last one is deleted). Not a today-problem; flagged for the s3a.26 reviewer.

---

**Style note:** Matches `.cursor/plans/s3a14_rate_limit.plan.md` and `.cursor/plans/s3a16_blocks_mutes.plan.md` shape. Markdown checkboxes in the front-matter `todos`. No emojis. "Jettison" only as a proper noun. Empty-state copy in section 6 uses neutral verbs only.
