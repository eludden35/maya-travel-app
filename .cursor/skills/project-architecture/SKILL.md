---
name: project-architecture
description: Architect-level guidance for this repo — boundaries (server vs client), Supabase as source of truth, threat model, evolution path from MVP to payments/webhooks, and ADR template. Use when designing a new module, choosing where logic should run, modeling who can read/write what under RLS, weighing tradeoffs across modules, or writing/updating an Architecture Decision Record at docs/adr/.
---

# Project architecture

This skill expresses the **architecture lens** from `project-team-lenses.mdc`. Use it when planning anything that crosses a boundary — server vs client, table vs edge function, organizer vs participant, ours vs payment provider.

## Source of truth

- **Supabase Postgres** is the system of record. Other systems (payment provider, email, future webhooks) are integrators.
- **Auth** is Supabase Auth. The user identity at the edge is `auth.uid()`; server code derives everything else from that.
- **Schema lives in migrations**, not in dashboards. Dashboards are read-only in production for our team.

## Server vs client boundary

- **Browser** holds the **publishable key** (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `sb_publishable_*`; legacy: anon key) plus the user's session. It can read/write only what RLS allows.
- **Server** (route handlers / server actions / edge functions / webhook receivers) is the **only** place the **secret key** (`SUPABASE_SECRET_KEY`, `sb_secret_*`; legacy: `SUPABASE_SERVICE_ROLE_KEY`) may appear.
- Anything that **proves** something to a third party (signed webhooks, payment provider calls) lives **server-side**, period.

If the framework choice has not landed yet, you are **deferring** the exact server primitive. The boundary above is the contract — pick the implementation that honors it.

## Threat-model lite

For every new feature, answer four questions in the plan:

1. **Who** can read this data? (anon, authenticated user, member of a trip, organizer of a trip, internal/service)
2. **Who** can write this data? (same axes)
3. What happens if **someone outside that set** sends the request anyway? (RLS denies, server returns 403, webhook signature check fails)
4. What is logged, and **does that log itself contain secrets or PII**? (it must not)

Capture the answers in the relevant migration's comment block or in the PR description.

## Evolution path

Plan the architecture so each step adds value without rewriting the last:

| Step | What we add | What stays the same |
|------|-------------|---------------------|
| **MVP (social-first)** | Profiles + follow graph, Trip visibility (`private`\|`unlisted`\|`public`), in-trip Posts (text + pre-moderated photos), comments, reactions, followers feed, explore tab, join requests, mutual-context DMs, notifications, block + mute + report, image moderation pipeline, **plus** trips, members, expenses, shares, organizer-collected payments | RLS-first model, server-only secrets, types from `gen types`, money privacy hard rule |
| **Payments v1** | Payment provider integration (Stripe et al.); webhook receiver with idempotency | Auth + RLS untouched; money tables remain non-public; Profiles own the payment relationship (not raw `auth.users`) |
| **Payouts v2** | Direct member→venue payouts behind a feature flag | Webhook idempotency primitive reused |
| **Moderation v2** | AI auto-classification on uploads (top-of-funnel filter) | Manual moderator queue is the floor that always remains |
| **Phase 2 (gated)** | Lawyer-reviewed ToS, 24/7 trust & safety ops, algorithmic ranking | Visibility model + money privacy + image pre-moderation hard rules unchanged |
| **Beyond** | Multi-currency normalization, settlement reports, vendor onboarding | Domain model extends, doesn't fork |

If a proposed change requires undoing one of the "stays the same" guarantees, that is an **architectural decision** — write an ADR. The two non-negotiable hard rules from [`docs/adr/0002-social-vision-pivot.md`](../../../docs/adr/0002-social-vision-pivot.md) — **money data is never readable by non-trip-members** and **every uploaded image is pre-moderated and invisible until approved** — survive every later step unless explicitly superseded by an ADR.

## Public-content RLS patterns

The social-first MVP introduces world-readable content (public Profiles, public Trips, public Posts) that lives next to private money data. The RLS pattern needs to handle both without leaking either way.

### Trip visibility enum

```sql
create type trip_visibility as enum ('private', 'unlisted', 'public');

alter table trips add column visibility trip_visibility not null default 'private';
create index trips_public_idx on trips (visibility) where visibility = 'public';
```

### Visibility-aware policies

```sql
-- Trips: select policy that fans out to membership for private/unlisted, world-read for public
create policy "trips_select_visible" on trips
  for select to authenticated, anon
  using (
    visibility = 'public'
    or exists (
      select 1 from trip_members tm
      where tm.trip_id = trips.id
        and tm.profile_id = auth.uid()
    )
  );
```

The same shape extends to Posts (joined to their parent Trip's visibility), Comments, Reactions, etc.

### The money-data hard rule, in SQL

Money tables (`expenses`, `expense_shares`, `payouts`, anything monetary) get **member-only** policies — they do **not** consult `trips.visibility`:

```sql
-- expenses: select policy — members only, regardless of trip visibility
create policy "expenses_select_members" on expenses
  for select to authenticated
  using (
    exists (
      select 1 from trip_members tm
      where tm.trip_id = expenses.trip_id
        and tm.profile_id = auth.uid()
    )
  );
-- NO branch for visibility = 'public'. Period.
```

This rule is checklisted in [`.cursor/rules/supabase-security.mdc`](../../../.cursor/rules/supabase-security.mdc) and [`.cursor/rules/project-review-checklist-sql.mdc`](../../../.cursor/rules/project-review-checklist-sql.mdc). Any migration touching a money table that consults a `visibility` column or social-grant table fails review.

### Materialized feed considerations (post-MVP, not now)

The chronological followers-feed at MVP can run as a query each request. Once volume justifies it, consider a materialized `feed_entries` table fed by triggers — keep the visibility logic in policies, not in the trigger, so a future Trip flipping from `public` → `private` automatically removes its posts from non-member feeds.

## Image upload + pre-moderation pipeline

Hard rule from ADR 0002: **no uploaded image is visible to anyone but the uploader until a human moderator approves it.** Architecture below is the enforcement primitive.

### State machine

```text
[client upload to private bucket]
   ↓
[server: EXIF GPS strip] ────fail──→ [error to user, no row written]
   ↓
[server: CSAM scan]      ────hit───→ [quarantine, audit-log, legal report path; no row visible to user]
   ↓
[image row inserted: state = 'pending_review'; file at storage path 'pending/{uploader}/{uuid}']
[parent post row: state = 'pending_media' (or 'pending_review' if no other media pending)]
   ↓
[manual moderator review in queue UI]
   ↓
   ├── approve: copy file to 'approved/{uuid}'; image row state = 'approved' with approved_path; parent post → 'published'; notifications fire
   └── reject:  image row state = 'rejected' with reason_code; parent post → 'rejected'; uploader notified; rejected file retained for {audit_window_days}, then deleted
```

### Two-tier Supabase Storage

Two buckets enforce visibility at the storage layer (not just the DB row):

| Bucket | Visibility | RLS predicate (read) |
|---|---|---|
| `images-pending` (private) | uploader + moderator role only | `auth.uid() = uploader_id OR is_moderator(auth.uid())` |
| `images-approved` (public-readable) | world (URLs only exist after approval) | `true` (the existence of the file is the gate) |

On approval, the server-side worker copies the file from `images-pending/...` to `images-approved/...` and sets `images.approved_path`. The pending file is deleted on a delay (audit window).

### `images` table sketch

```sql
create type image_state as enum (
  'pending_review',  -- in private bucket, awaiting moderator
  'approved',        -- in public bucket, visible per parent visibility
  'rejected'         -- in private bucket only, audit-retained then deleted
);

create type rejection_reason as enum (
  'nudity',
  'violence',
  'minors',
  'csam',                -- distinct from 'minors'; legal-report path
  'unrelated_to_trip',
  'spam',
  'other'
);

create table images (
  id uuid primary key default gen_random_uuid(),
  uploader_id uuid not null references profiles(id),
  post_id uuid references posts(id) on delete cascade,
  state image_state not null default 'pending_review',
  pending_path text not null,           -- storage path in images-pending
  approved_path text,                   -- storage path in images-approved (set on approve)
  rejection_reason rejection_reason,    -- set on reject
  exif_stripped_at timestamptz not null default now(),
  scanned_at timestamptz,               -- CSAM scan timestamp
  reviewed_at timestamptz,
  reviewed_by uuid references profiles(id)
);
create index images_state_idx on images (state) where state = 'pending_review';
```

### RLS keeps pending images invisible

```sql
create policy "images_select_pending_uploader_or_moderator" on images
  for select to authenticated
  using (
    state = 'approved'
    or auth.uid() = uploader_id
    or is_moderator(auth.uid())
  );

create policy "images_select_approved_anyone" on images
  for select to anon
  using (state = 'approved');
```

The same pattern shapes the storage bucket policies: pending bucket only reads if (uploader OR moderator); approved bucket reads if file exists.

### AI auto-classification contract (forward-looking)

The P1 AI auto-classification follow-up Bead plugs in **between** the CSAM scan and the moderator queue. Its contract:

- Input: image + EXIF-stripped + CSAM-scan-passed.
- Output: `{ verdict: 'auto_approve' | 'auto_reject_<reason>' | 'route_to_human', confidence: float }`.
- Hard-coded thresholds: only `auto_approve` and `auto_reject_<reason>` skip the human queue, and only above a high confidence threshold (set by the AI Bead). All ambiguous cases route to the human queue.
- **The `images.state` machine is unchanged.** The AI just decides which transition fires next; the moderator queue remains the floor.

## Moderator role + queue access

At MVP the only moderator is the founder. The role is modeled as a column on Profile + a server-only check:

```sql
alter table profiles add column is_moderator boolean not null default false;

create or replace function public.is_moderator(profile_id uuid)
  returns boolean
  language sql
  security definer
  set search_path = public
as $$
  select coalesce(
    (select is_moderator from profiles where id = profile_id),
    false
  );
$$;
```

`is_moderator` is set **manually** in the Supabase dashboard for the founder Profile at MVP — there is no UI to grant moderator status, and never will be one without a hardening Bead. The `security definer` wrapper lets RLS predicates call `is_moderator(auth.uid())` without recursion.

Routes that surface the queue (`/admin/moderate`) check `is_moderator(auth.uid())` server-side in a Server Component / Route Handler **before** rendering anything, never client-side.

## DM gating implementation sketch

The DM gating predicate is the central social safety primitive. Codify it as a SQL function so RLS, application code, and the AI auto-classification pipeline all use the same definition:

```sql
create or replace function public.can_dm(sender uuid, recipient uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select
    -- (a) mutual follow
    (
      exists (select 1 from follows where follower_id = sender    and followee_id = recipient)
      and
      exists (select 1 from follows where follower_id = recipient and followee_id = sender)
    )
    or
    -- (b) shared trip membership
    exists (
      select 1
      from trip_members a join trip_members b on a.trip_id = b.trip_id
      where a.profile_id = sender and b.profile_id = recipient
    )
    or
    -- (c) open join request between them (either direction)
    exists (
      select 1 from join_requests jr
      join trip_members tm on tm.trip_id = jr.trip_id
      where jr.state = 'pending'
        and (
          (jr.requester_id = sender    and tm.profile_id = recipient)  -- recipient is org of trip sender wants to join
          or
          (jr.requester_id = recipient and tm.profile_id = sender)     -- sender is org of trip recipient wants to join
        )
    );
$$;
```

Use it in `dm_messages` insert policies (`with check (public.can_dm(sender_id, recipient_id))`) and in the composer's gating UI. **Block** trumps `can_dm` — a separate `blocks` check in the policy returns false unconditionally.

## ADRs

We record architecturally significant decisions as **Architecture Decision Records** at:

```
docs/adr/NNNN-title.md
```

Sequential, dated, status one of **Proposed / Accepted / Superseded**. The first ADR is the framework choice (`docs/adr/0001-framework-choice.md`).

### ADR template

```markdown
# NNNN. <Title>

- Date: YYYY-MM-DD
- Status: Proposed | Accepted | Superseded by NNNN

## Context
What problem are we solving? What constraints (Supabase backend, mobile-first, MVP scope, Jettison brand) frame this?

## Decision
The chosen path, in one or two sentences.

## Alternatives considered
- Option A — pros / cons / why not.
- Option B — pros / cons / why not.

## Consequences
- What becomes easier.
- What becomes harder.
- New rules, skills, or migrations this implies.

## Follow-ups
- Beads issues created.
- Rules / skills updated.
```

## When to write an ADR

- Picking a framework, language runtime, hosting target, or styling system.
- Adding a new external system (payment provider, queue, email).
- Changing the trust boundary or the auth model.
- Reversing an earlier accepted ADR.

When in doubt, write one. Cheap to write, expensive to reconstruct later.
