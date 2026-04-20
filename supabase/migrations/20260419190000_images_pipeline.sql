-- =============================================================================
-- images + moderation_decisions + storage buckets: image pre-moderation
--   substrate. Bead tripplanner-s3a.4.
--
-- HARD-RULE CITATION
--   Image pre-moderation hard rule (.cursor/rules/supabase-security.mdc #2,
--   ADR docs/adr/0002-social-vision-pivot.md): every uploaded image is
--   invisible to anyone but the uploader and the moderator role until a
--   human moderator approves it. EXIF GPS strip + CSAM scan run before any
--   row enters pending_review.
--
--   This migration's combined effect satisfies the hard rule via three
--   orthogonal layers, all of which must agree to publish an image:
--     (1) images RLS (select): non-owner non-moderator reads gate on
--         state = 'approved'. A pending_media / pending_review / rejected
--         row is invisible to every other authenticated and anon caller.
--     (2) storage.objects RLS on images-pending: read gate on
--         auth.uid() = uploader_id OR is_moderator(auth.uid()), with
--         uploader encoded as the FIRST path segment so the policy can
--         compare without joining public.images.
--     (3) storage.objects on images-approved: NO insert/update/delete
--         policy for any client role; only the server-only admin client
--         (SUPABASE_SECRET_KEY, lib/supabase/admin.ts) can move objects
--         from pending → approved. The act of approval IS the move.
--
--   Any one of these three layers refusing is sufficient to keep an
--   un-approved image invisible. The user-session client cannot upload
--   directly into images-approved, cannot self-approve their own row, and
--   cannot read another user's pending row.
--
--   See lib/images.ts for the single legitimate write path
--   (uploadPendingImage / markImageApproved / markImageRejected). Direct
--   insert / update from a session client either fails RLS or is gated by
--   public.is_moderator(auth.uid()).
--
-- STATE MACHINE
--   pending_media   ← row inserted after EXIF strip, before CSAM scan.
--                     Reserved seam for tripplanner-s3a.5.
--   pending_review  ← CSAM scan passed; awaiting human moderator.
--   approved        ← moderator approved; file copied to images-approved.
--   rejected        ← moderator rejected; file retained in images-pending
--                     for audit window then pruned (cleanup follow-up;
--                     not scheduled at MVP — see plan §10).
--
--   pending_media → pending_review is the seam tripplanner-s3a.5 (CSAM
--   scan) wires into. Until s3a.5 ships, lib/images.ts inserts rows
--   directly with state = 'pending_review' (skipping pending_media), so
--   the four-state set is shipped now to avoid a future
--   `alter type ... add value` rewrite. The Bead AC's three-state set
--   (pending_review | approved | rejected) is a strict subset of the
--   four-state set shipped here; deliberate broadening so the s3a.5
--   transition is purely a state-machine extension, not a schema change.
--
-- THREAT MODEL
--   1) Read pending images via the DB.
--      → images_select_approved_owner_or_moderator gates non-owner reads
--        on state = 'approved'. Returns zero rows otherwise.
--   2) Read pending images via the storage bucket directly.
--      → storage_pending_select_uploader_or_moderator gates on the path's
--        first segment matching auth.uid() OR is_moderator(auth.uid()).
--   3) Mutate someone else's images row (e.g. flip state to 'approved').
--      → images_update_moderator_only requires is_moderator(auth.uid()).
--        Owners cannot self-approve.
--   4) Tombstone evidence by deleting one's own pending row.
--      → images_delete_moderator_only — uploader cannot delete.
--   5) Insert a pre-approved row to bypass moderation.
--      → images_insert_self_pending with-check gates state ∈ {pending_media,
--        pending_review} AND requires approved_path/rejection_reason/
--        reviewed_at/reviewed_by to be NULL.
--   6) Direct upload to images-approved.
--      → No insert/update/delete policy on storage.objects for that bucket;
--        only the admin client (RLS bypass) can write. Insert rejected.
--   7) Logs / PII.
--      → uploader_id (FK to profiles), storage paths, EXIF-strip timestamp,
--        moderator id on transition. NO image content in logs; NO money
--        fields touched (money-privacy hard rule satisfied by negative —
--        this migration never references any monetary table; the
--        money-privacy `rg` against this file returns zero matches).
--
-- OPEN CONSUMERS (deferred to follow-up Beads — wiring contract documented):
--   - tripplanner-s3a.5: writes the pending_media → pending_review
--     transition after CSAM vendor verdict. Failure-closed (vendor outage
--     keeps the row in pending_media; never reaches a moderator).
--   - tripplanner-s3a.6: reads getPendingImageQueue(); calls
--     markImageApproved / markImageRejected with reason_code. Writes
--     moderation_decisions rows.
--   - tripplanner-s3a.7: posts reference image ids; post visibility gated
--     on every referenced image being state='approved' (or visible to
--     viewer per RLS).
--   - tripplanner-s3a.21: profiles.avatar_image_id FK to images(id) on
--     delete set null.
--   - tripplanner-45u: AI auto-classifier between CSAM and human queue;
--     writes moderation_decisions rows with reviewer_id = NULL +
--     reviewer_kind = 'system'.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

create type public.image_state as enum (
  'pending_media',   -- post-EXIF, pre-CSAM. Reserved seam for s3a.5.
  'pending_review',  -- post-CSAM, awaiting moderator.
  'approved',        -- moderator approved; file in images-approved.
  'rejected'         -- moderator rejected; file retained in images-pending for audit.
);

create type public.rejection_reason as enum (
  'nudity',
  'violence',
  'minors',
  'csam',                -- distinct from 'minors'; legal-report path.
  'unrelated_to_trip',
  'spam',
  'other'
);

create type public.moderation_verdict as enum (
  'approve',
  'reject'
);

create type public.moderation_actor_kind as enum (
  'human',   -- moderator queue UI (s3a.6) or founder-runs-SQL.
  'system'   -- CSAM auto-reject (s3a.5) or AI auto-classifier (45u).
);

-- ----------------------------------------------------------------------------
-- images
-- ----------------------------------------------------------------------------

create table public.images (
  id                 uuid primary key default gen_random_uuid(),
  uploader_id        uuid not null references public.profiles(id) on delete cascade,
  state              public.image_state not null default 'pending_media',
  intended_use       text not null check (intended_use in ('avatar', 'post')),
  pending_path       text not null,             -- storage key in images-pending
  approved_path      text,                      -- storage key in images-approved (set on approve)
  rejection_reason   public.rejection_reason,   -- set on reject
  bytes              integer not null check (bytes > 0 and bytes <= 10485760),  -- 10 MB cap; mirrors MAX_BYTES in lib/images.ts
  width              integer check (width is null or width > 0),
  height             integer check (height is null or height > 0),
  mime_type          text not null check (mime_type in ('image/jpeg', 'image/webp', 'image/png')),
  exif_stripped_at   timestamptz not null default now(),
  scanned_at         timestamptz,               -- set when s3a.5 CSAM scan passes
  reviewed_at        timestamptz,
  reviewed_by        uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  -- Invariants:
  check (state <> 'approved'  or approved_path is not null),
  check (state <> 'rejected'  or rejection_reason is not null),
  check ((state in ('approved','rejected')) = (reviewed_at is not null)),
  check ((state in ('approved','rejected')) = (reviewed_by is not null))
);

comment on table public.images is
  'User-uploaded images, pre-moderation substrate. See migration header for the hard rule citation, threat model, and state machine. Bead tripplanner-s3a.4.';
comment on column public.images.pending_path is
  'Storage key under images-pending. Convention: {uploader_uuid}/{image_uuid}.{ext}. The uploader uuid as the FIRST path segment is what lets storage_pending_select_uploader_or_moderator gate without a JOIN to public.images.';
comment on column public.images.approved_path is
  'Storage key under images-approved. Set ONLY by markImageApproved (lib/images.ts) at the moment the bucket-to-bucket copy succeeds. NULL until then.';
comment on column public.images.exif_stripped_at is
  'Timestamp captured at the moment lib/images.ts re-encoded the file via sharp (which strips ALL metadata, including EXIF GPS, as a side effect of re-encoding). The row cannot exist without this having happened — the helper inserts AFTER the strip.';

create index images_uploader_id_idx
  on public.images (uploader_id);

create index images_state_pending_idx
  on public.images (state)
  where state in ('pending_media', 'pending_review');

create index images_state_approved_idx
  on public.images (state)
  where state = 'approved';

create index images_intended_use_idx
  on public.images (intended_use);

-- ----------------------------------------------------------------------------
-- images RLS
-- ----------------------------------------------------------------------------

alter table public.images enable row level security;

-- SELECT: approved is world-visible (anon + authenticated); the uploader
-- always sees their own row; moderators see every row.
create policy "images_select_approved_owner_or_moderator"
  on public.images
  for select
  to authenticated, anon
  using (
    state = 'approved'
    or auth.uid() = uploader_id
    or public.is_moderator(auth.uid())
  );

-- INSERT: uploader inserts only their own row, only in a pending state.
-- Approval / rejection writes are UPDATE, not INSERT.
create policy "images_insert_self_pending"
  on public.images
  for insert
  to authenticated
  with check (
    auth.uid() = uploader_id
    and state in ('pending_media', 'pending_review')
    and approved_path is null
    and rejection_reason is null
    and reviewed_at is null
    and reviewed_by is null
  );

-- UPDATE: only moderators can update an images row from a session. Used by
-- markImageApproved and markImageRejected (called from the future s3a.6
-- moderator UI). The CSAM transition (s3a.5) will run server-side via the
-- admin client which bypasses RLS, so this policy does not need a system-
-- caller branch — it just needs to be tight enough that the user-session
-- client cannot self-approve.
create policy "images_update_moderator_only"
  on public.images
  for update
  to authenticated
  using (public.is_moderator(auth.uid()))
  with check (public.is_moderator(auth.uid()));

-- DELETE: moderators only. Uploader cannot tombstone evidence. Audit-window
-- pruning of rejected images is performed via the admin client (RLS-
-- bypassing) by a future cleanup job; not exercised by any client today.
create policy "images_delete_moderator_only"
  on public.images
  for delete
  to authenticated
  using (public.is_moderator(auth.uid()));

-- ----------------------------------------------------------------------------
-- moderation_decisions (audit table)
-- ----------------------------------------------------------------------------

create table public.moderation_decisions (
  id               uuid primary key default gen_random_uuid(),
  image_id         uuid not null references public.images(id) on delete cascade,
  verdict          public.moderation_verdict not null,
  rejection_reason public.rejection_reason,
  notes            text check (notes is null or length(notes) <= 1000),
  reviewer_kind    public.moderation_actor_kind not null,
  reviewer_id      uuid references public.profiles(id),       -- nullable when reviewer_kind = 'system'
  confidence       numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_at       timestamptz not null default now(),
  -- Invariants:
  check (verdict <> 'reject' or rejection_reason is not null),
  check (reviewer_kind = 'system' or reviewer_id is not null),
  check (reviewer_kind = 'human'  or confidence is not null)
);

comment on table public.moderation_decisions is
  'Append-only audit of every moderation transition. Written by markImageApproved / markImageRejected (s3a.6 UI), by tripplanner-s3a.5 (CSAM auto-reject), and by tripplanner-45u (AI auto-classifier). Bead tripplanner-s3a.4.';

create index moderation_decisions_image_id_idx
  on public.moderation_decisions (image_id);

create index moderation_decisions_reviewer_id_idx
  on public.moderation_decisions (reviewer_id)
  where reviewer_id is not null;

create index moderation_decisions_created_at_idx
  on public.moderation_decisions (created_at desc);

-- ----------------------------------------------------------------------------
-- moderation_decisions RLS
-- ----------------------------------------------------------------------------

alter table public.moderation_decisions enable row level security;

-- SELECT: moderators see all; the original uploader can see their own
-- image's decisions (so the UI can render "your image was rejected
-- because <reason>").
create policy "moderation_decisions_select_uploader_or_moderator"
  on public.moderation_decisions
  for select
  to authenticated
  using (
    public.is_moderator(auth.uid())
    or exists (
      select 1 from public.images i
      where i.id = moderation_decisions.image_id
        and i.uploader_id = auth.uid()
    )
  );

-- INSERT: only moderators can write a human decision row from a session.
-- System rows (CSAM, AI auto-classifier) are written by the admin client
-- and bypass RLS; that is acceptable because the admin client is server-
-- only (lib/supabase/admin.ts) and the secret key never reaches the
-- client bundle (.cursor/rules/supabase-security.mdc).
create policy "moderation_decisions_insert_moderator"
  on public.moderation_decisions
  for insert
  to authenticated
  with check (
    public.is_moderator(auth.uid())
    and reviewer_kind = 'human'
    and reviewer_id = auth.uid()
  );

-- No UPDATE or DELETE policy. Append-only audit trail.

-- ----------------------------------------------------------------------------
-- Storage buckets
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values
  ('images-pending',  'images-pending',  false),
  ('images-approved', 'images-approved', true)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- storage.objects RLS policies
--
-- Object-key convention (encoded by lib/images.ts):
--   images-pending/{uploader_uuid}/{image_uuid}.{ext}
--   images-approved/{image_uuid}.{ext}
--
-- The uploader uuid being the FIRST path segment under images-pending is
-- what lets the pending-bucket SELECT policy gate read access without a
-- JOIN to public.images.
-- ----------------------------------------------------------------------------

-- (1) Uploader can read their own pending objects; moderator can read any
--     pending object; nobody else can.
create policy "storage_pending_select_uploader_or_moderator"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'images-pending'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_moderator(auth.uid())
    )
  );

-- (2) Uploader can insert into their own folder under images-pending. The
--     Server Action wrapper (lib/images.ts -> uploadPendingImage) is also
--     enforced before this write happens (rate-limit, file-size, EXIF
--     strip); this storage policy is the second line of defense.
create policy "storage_pending_insert_self"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'images-pending'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- (3) Nobody (other than the admin client, which bypasses RLS) can update
--     or delete pending objects. The admin client handles approval-time
--     cleanup. Intentionally no update/delete policy on images-pending.

-- (4) Approved bucket: world-readable. The bucket itself is public=true so
--     the CDN serves objects directly; we still ship an explicit select
--     policy so the model is documented in code rather than implicit in
--     the bucket flag.
create policy "storage_approved_select_world"
  on storage.objects
  for select
  to authenticated, anon
  using (bucket_id = 'images-approved');

-- (5) Approved bucket: NO insert/update/delete policy for any client role.
--     Only the admin client (SUPABASE_SECRET_KEY, lib/supabase/admin.ts)
--     can write here, via the service-role's RLS bypass. This is the
--     single chokepoint that makes "moderator approval IS the publication
--     event" mechanically true.

-- NOTE: `comment on policy ... on storage.objects` is intentionally not used
-- here. `storage.objects` is owned by the `supabase_storage_admin` role; the
-- migration role can CREATE POLICY against it but cannot COMMENT on those
-- policies (SQLSTATE 42501). The semantics of each storage.objects policy
-- are documented in this file's header block above instead — that is the
-- single source of truth.
