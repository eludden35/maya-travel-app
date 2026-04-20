---
name: photo storage pipeline + pending_review state machine (s3a.4)
overview: "Stand up the image-moderation substrate the social-first MVP rests on — two Supabase Storage buckets (private images-pending + public-readable images-approved), the images table with image_state enum (pending_media | pending_review | approved | rejected), the server-side EXIF GPS strip, the moderation_decisions audit table, and the lib/images.ts helpers + lib/supabase/admin.ts service-role module that every consumer chunk (s3a.21 avatars, s3a.7 Posts, s3a.5 CSAM, s3a.6 moderator queue UI) will plug into. Pure infrastructure — no UI surface in this chunk by design."
todos:
  - id: deps
    content: "Add sharp (server-side EXIF strip + image normalization) to package.json. Pure infra dependency; no client-bundle impact because lib/images.ts is `import \"server-only\"`."
    status: pending
  - id: migration
    content: "Write supabase/migrations/20260419190000_images_pipeline.sql: image_state + rejection_reason enums; images table + RLS (select gates non-uploader/non-moderator on state='approved'; insert keyed to auth.uid()=uploader_id; update locked to moderators via is_moderator(auth.uid())); moderation_decisions audit table + RLS (insert moderator-only, select uploader OR moderator); storage.buckets rows for images-pending (private) + images-approved (public); storage.objects RLS policies enforcing the four-rule bucket gate; threat-model + hard-rule citation in header comment."
    status: pending
  - id: admin-client
    content: "Create lib/supabase/admin.ts: a single server-only module exporting a service-role Supabase client (`SUPABASE_SECRET_KEY`). Used only by lib/images.ts to copy/delete bucket objects on approval/rejection (bucket-to-bucket moves require RLS bypass). Module is `import \"server-only\"`; the boundary `rg` for SUPABASE_SECRET_KEY/sb_secret_ should now match this file (and only this file) under lib/."
    status: pending
  - id: helpers
    content: "Write lib/images.ts (server-only): uploadPendingImage / getImageById / markImageApproved / markImageRejected / getPendingImageQueue. EXIF strip via sharp before any DB row exists. Per-uploader pending-image cap (uses withRateLimit from s3a.14 with a new IMAGES_UPLOAD spec, 10/hour default). PG error-code map and discriminated-union result types matching the lib/blocks.ts / lib/follows.ts house style. TODO(s3a.5) seam in uploadPendingImage where CSAM scan will hook in; until s3a.5 ships, the helper inserts directly with state='pending_review'."
    status: pending
  - id: types-spec
    content: "Add IMAGES_UPLOAD entry to RATE_LIMITS in lib/rate-limit.ts. This is the one cross-chunk file we touch — verify nothing else is in flight against lib/rate-limit.ts before launching the implementation subagent."
    status: pending
  - id: verify
    content: "pnpm tsc --noEmit; pnpm lint; ReadLints clean on touched files; supabase db push --linked; supabase gen types typescript --linked > database.types.ts (parent agent only); cleanup any temp-type narrowing in lib/images.ts after type regen; smoke-test SQL block (insert pending image as user A, assert user B sees zero, user A sees one, moderator sees one, anon sees zero); money-privacy rg negative (none of the new tables touch monetary tables)."
    status: pending
isProject: false
---

# s3a.4 — photo storage pipeline + pending_review state machine

**Active Bead:** [`tripplanner-s3a.4`](#) — _infra: photo storage pipeline + pending_review state machine_, P1, parent `tripplanner-s3a`. No declared blockers; substrate Bead for the entire image-bearing surface of the social MVP.

**Bead AC (verbatim):** _Both buckets exist with correct RLS. images table + RLS in same migration with state enum (pending_review | approved | rejected). EXIF GPS strip runs server-side before any row is inserted. Per-user upload quota in place. Approval flow copies file from pending → approved bucket._

## 1. Bead context

- **ID + title:** `tripplanner-s3a.4` — _infra: photo storage pipeline + pending_review state machine_.
- **Priority / parent:** P1, parent `tripplanner-s3a` (epic).
- **AC lines this chunk satisfies (verbatim mapping):**
  - "Both buckets exist with correct RLS." → covered by `storage.buckets` rows + `storage.objects` policies in the migration.
  - "images table + RLS in same migration with state enum (pending_review | approved | rejected)." → covered by `images` + `image_state` enum in the migration. **Divergence note:** the prompt for this chunk asks us to model the state machine as `pending_media → pending_review → approved | rejected` so that the s3a.5 (CSAM scan) seam lives between `pending_media` and `pending_review`. The Bead AC's three-state set is a strict subset of the four-state set we ship. The architecture skill's existing sketch is the three-state form; we extend it forward by one state. Recorded in the migration header so reviewers see the deliberate broadening.
  - "EXIF GPS strip runs server-side before any row is inserted." → covered by `sharp`-based strip inside `uploadPendingImage` in `lib/images.ts`. The DB row is only inserted after `sharp` has rewritten the file without EXIF, which is also when the file lands in the pending bucket.
  - "Per-user upload quota in place." → covered by a new `IMAGES_UPLOAD` entry in `lib/rate-limit.ts` (default `10/hour`); `uploadPendingImage` calls `withRateLimit` before doing any work.
  - "Approval flow copies file from pending → approved bucket." → covered by `markImageApproved` in `lib/images.ts`, which uses `lib/supabase/admin.ts` (service-role) to `copy` then `delete` between buckets atomically with the `images.state` update.
- **AC lines honest-deferred:** none. The Bead's AC is fully ship-able in this chunk. The two adjacent things that *look* like AC but actually live in sibling Beads are (a) the actual CSAM call (`tripplanner-s3a.5`) — we ship the seam, not the vendor integration — and (b) the moderator UI that exercises `markImageApproved` / `markImageRejected` (`tripplanner-s3a.6`).
- **What shipped on the way in:** [`tripplanner-s3a.1`](#) (Profile entity + `is_moderator` column + `is_moderator(uuid)` security-definer helper), [`tripplanner-s3a.2`](#) (follows + smallest end-to-end UI slice), [`tripplanner-s3a.16`](#) (blocks + mutes + the block-trumps-follow trigger), [`tripplanner-s3a.14`](#) (rate-limit primitive — `withRateLimit` + `try_consume_rate_limit`), [`tripplanner-s3a.17`](#) (template ToS / Community Guidelines / Privacy + footer chrome). The `is_moderator(uuid)` function in particular is **load-bearing** for this chunk's RLS and is reused without change.
- **Two hard rules that govern this chunk:**
  - **Image pre-moderation hard rule** ([`.cursor/rules/supabase-security.mdc`](../../.cursor/rules/supabase-security.mdc) #2 / [ADR 0002](../../docs/adr/0002-social-vision-pivot.md)): every uploaded image is invisible to anyone but the uploader and the moderator role until a human moderator approves it. The whole point of this chunk is to make that rule mechanically enforceable at the substrate layer. **This is the load-bearing constraint. Every design decision below is justified against it.**
  - **Money-privacy hard rule** (#1): money tables get member-only RLS that does not consult social-grant tables. **Less directly relevant** here because none of the tables this chunk creates are monetary. We honor it by negative: the `images` and `moderation_decisions` tables never reference `expenses` / `expense_shares` / `payouts`, the storage buckets never store financial documents, and a money-privacy `rg` against the new migration matches zero monetary identifiers. Called out so the reviewer doesn't have to re-derive that the rule is satisfied.

## 2. Scope IN / OUT

### IN (this chunk)

- `image_state` enum: `pending_media | pending_review | approved | rejected`.
- `rejection_reason` enum: matches the architecture-skill sketch (`nudity | violence | minors | csam | unrelated_to_trip | spam | other`).
- `images` table + indexes + RLS (select / insert / update / delete policies separately).
- `moderation_decisions` audit table + indexes + RLS.
- `storage.buckets` rows for `images-pending` (private) and `images-approved` (public-readable).
- `storage.objects` RLS policies that enforce the four-rule bucket gate (see §3).
- A single header comment on the migration that **cites the image pre-moderation hard rule by name** and explains exactly which combination of policies satisfies it.
- `lib/images.ts` (server-only) with the five public helpers below.
- `lib/supabase/admin.ts` — first server-only service-role client in the repo. Used only by `lib/images.ts` for cross-bucket object moves and the bucket-policy-bypassing parts of approve/reject.
- `lib/rate-limit.ts` extension: add `IMAGES_UPLOAD: { surface: "images_upload", max: 10, windowSeconds: 60 * 60 }` to `RATE_LIMITS`. (One-line additive change; no signature change.)
- A `TODO(s3a.5)` comment in `uploadPendingImage` and in the migration header documenting where the CSAM scan plugs in.
- Pre-allocated migration timestamp **`20260419190000`** so this chunk does not collide with anything else.

### OUT (deferred — file or honor existing Beads)

- **Avatar upload UI + `profiles.avatar_image_id` FK** → [`tripplanner-s3a.21`](#) (existing). That chunk adds the FK column in its own migration and ships the avatar consumer surface.
- **Posts table + Post composer + `pending_media` → `pending_review` transition for whole posts** → [`tripplanner-s3a.7`](#) (existing).
- **CSAM scan integration (vendor + audit + fail-closed behavior)** → [`tripplanner-s3a.5`](#) (existing, P0 gate). The state-machine seam is the contract.
- **Founder-only moderator queue UI at `/admin/moderate`** → [`tripplanner-s3a.6`](#) (existing, P0 gate). Will call `getPendingImageQueue` / `markImageApproved` / `markImageRejected` from this chunk's helpers.
- **AI auto-classifier between CSAM and human queue** → [`tripplanner-45u`](#) (existing). Plugs in between `pending_media` and `pending_review` after s3a.5 lands.
- **Image rendering UI + `<img>` / `<Image>` wrappers + alt-text policy** → handled per-consumer (avatars in s3a.21, post images in s3a.7).
- **Bucket-policy-level direct uploads from the browser via signed URLs** → not in this chunk. Uploads go through the Server Action wrapper so the EXIF strip is non-skippable. Direct-upload + Edge-function-based EXIF strip is a perf optimization that can come later behind the same `lib/images.ts` interface.
- **Storage cost ceiling per uploader (aggregate bytes)** → noted in §10; defer to a follow-up if/when load matters.
- **Pure-substrate UI proof-of-life** → none in this chunk. Justified in §6 against the s3a.2 lesson.

**Per the parallel-chunks contract** ([`project-orchestration` SKILL.md](../../.cursor/skills/project-orchestration/SKILL.md) → "Parallel chunks"): if this chunk is launched in parallel with another, both **must** stop before `supabase db push`, type regen, and commits. The parent agent sequences those.

## 3. Architecture

### 3.1 Where each piece runs

| Piece | Runtime | Rationale |
|---|---|---|
| `lib/images.ts` | server-only (`import "server-only";`) | Holds the EXIF strip (Node-only `sharp`), the service-role bucket moves, and the rate-limit gate. Cannot be reached from `"use client"` modules — that is the *point*; it is what makes the EXIF strip non-skippable. |
| `lib/supabase/admin.ts` | server-only (`import "server-only";`) | Single chokepoint for `SUPABASE_SECRET_KEY`. Cross-bucket `copy` + `delete` requires RLS bypass; nothing else in `lib/images.ts` needs the secret key. |
| `app/_actions/images-actions.ts` | **deferred — not in this chunk** | Server Action wrappers will live next to the consumer chunks (`s3a.21` for avatars, `s3a.7` for posts). Each consumer wraps `uploadPendingImage` in its own `"use server"` action with the right `intendedUse` and the right `revalidatePath`. Inventing a generic action here would commit us to a UX shape we have not designed yet. |
| Client components (drag-and-drop, preview, etc.) | **deferred — not in this chunk** | See §6. Consumer chunks own these. |
| `proxy.ts` | unchanged | No new auth boundary. |

### 3.2 The `images` state machine

```text
                    [client picks file in consumer chunk's UI]
                                    │
                                    ▼
                 [Server Action wrapper in consumer chunk]
                                    │
                                    ▼
              uploadPendingImage(file, { uploaderId, intendedUse })
                                    │
                  ┌─────────────────┴─────────────────┐
                  │                                   │
            [withRateLimit                      [sharp: read pixels,
             IMAGES_UPLOAD:                      strip EXIF + ALL
             10 per hour]                        metadata, re-encode
                  │                              to canonical jpeg/webp]
            rate_limited?─yes──> return error            │
                  │                                      │
                  no                                     │
                  └──────────────┬───────────────────────┘
                                 │
                                 ▼
              [admin client: putObject into images-pending/<uploader>/<uuid>]
                                 │
                                 ▼
                    INSERT images
                      state = 'pending_media'  ← s3a.4 lands here
                                 │
                       TODO(s3a.5): CSAM scan
                                 │
                                 ▼
                    UPDATE images
                      state = 'pending_review' ← s3a.5 will move this
                                 │                transition; until s3a.5
                                 ▼                ships, lib/images.ts
                       [moderator queue UI                 inserts directly
                        s3a.6 reads this row              with pending_review
                        via getPendingImageQueue]         per the AC three-
                                 │                        state set, OR (the
                  ┌──────────────┴──────────────┐         choice we make
                  │                             │         below) inserts as
                  ▼                             ▼         pending_media + an
        markImageApproved              markImageRejected  inline self-
                  │                             │         transition until
                  ▼                             ▼         s3a.5 wires its
        admin client copy:             admin client       gate.
        pending → approved             leaves file in
        + DELETE pending object        images-pending
        UPDATE images.state            UPDATE images.state
          = 'approved'                   = 'rejected'
        INSERT moderation_decisions    INSERT moderation_decisions
          (verdict='approve')            (verdict='reject', reason)
```

**Decision (recorded; revisit in implementation):** until s3a.5 ships, `uploadPendingImage` writes the row in `state = 'pending_review'` directly (skipping `pending_media`). The `pending_media` enum value is shipped now so s3a.5's migration can `update images set state = 'pending_review'` after a successful scan, and so the enum doesn't need to be `alter type ... add value` later (which is awkward and non-rollbackable). A `TODO(s3a.5)` comment in `lib/images.ts` calls this out at the seam. **Alternative considered:** ship only the three-state set today and add `pending_media` in s3a.5's migration — rejected because Postgres `alter type ... add value` is brittle and adding the enum value now is free.

### 3.3 Actor / transition table

| From | To | Actor | How |
|---|---|---|---|
| (no row) | `pending_media` | uploader (via `uploadPendingImage`) | Server Action; subject to `IMAGES_UPLOAD` rate limit and EXIF strip; row inserted by the user's session client (RLS-checked). **Until s3a.5 ships, this transition is fused with the next: row is inserted directly as `pending_review`.** |
| `pending_media` | `pending_review` | system (CSAM scanner — s3a.5) | Server-side in s3a.5; uses admin client to update past RLS. Failure (vendor outage) keeps the row in `pending_media` so it never reaches a moderator. |
| `pending_review` | `approved` | moderator (via `markImageApproved` from s3a.6 UI) | Admin client: copy bucket object, update `images.state`, insert `moderation_decisions`, delete pending object. RLS on `images` allows the update because `is_moderator(auth.uid())` is true; but we still use the admin client because the bucket moves bypass `storage.objects` policies cleanly. |
| `pending_review` | `rejected` | moderator (via `markImageRejected`) | Same shape, no copy. The pending file stays in `images-pending` for an audit window (deletion is a follow-up; see §10). |

Two transitions are intentionally **absent**: `approved → rejected` and `rejected → approved`. Reversing a moderation decision is a separate event that warrants its own `moderation_decisions` row at minimum; defer to s3a.6 if it surfaces a need.

### 3.4 Storage bucket strategy

**Decision: two buckets** — `images-pending` (private, RLS-gated reads) and `images-approved` (public-readable, no auth).

| Bucket | `public` flag | Read access | Write access |
|---|---|---|---|
| `images-pending` | `false` | uploader OR moderator (via `storage.objects` RLS) | uploader (insert) + admin client (copy/delete on approval/reject) |
| `images-approved` | `true` | anyone (existence is the gate; URLs only exist for approved files) | admin client only (no client-direct write path) |

**Why two buckets, not one with RLS?**

- **Defense in depth.** A misconfigured RLS policy on a single-bucket setup that accidentally returns `using (true)` exposes pending images to the world. Two buckets means the *bucket itself* is the boundary: an approved-bucket URL never points at a pending file because pending files literally are not in that bucket.
- **CDN reachability.** Supabase Storage public URLs hit the CDN; an approved-only bucket means we can serve the public CDN URL without any auth dance. A single-bucket-with-RLS approach forces a signed-URL or auth-on-every-request pattern for every approved image, which is worse for performance and complicates `<Image>` usage downstream.
- **Audit clarity.** "Has this image been approved?" answers via `storage.objects.bucket_id = 'images-approved'`, no JOIN to `images` needed. Useful in incident response.
- **Cost.** Only an approved file lives in the public bucket; rejected files stay in pending. The two-bucket model lets us schedule a future `pg_cron`/cleanup job that prunes `images-pending` rejected files past an audit window (see §10) without touching the public bucket at all.

**Tradeoff:** approval is now a two-step write (copy object + delete pending object + update `images` row). Approval is rare and slow-path-tolerable; the operational simplicity is worth it.

### 3.5 How the hard rule is satisfied

The image pre-moderation hard rule says: **no uploaded image is visible to anyone but the uploader and the moderator role until a human moderator approves it.**

The substrate satisfies it via three orthogonal layers, all of which must agree before any non-uploader/non-moderator can see the image:

1. **`images` row RLS (select policy):** non-uploader, non-moderator reads only return rows where `state = 'approved'`. A `pending_media` or `pending_review` or `rejected` row simply does not appear in `select * from images` for any other user.
2. **`storage.objects` RLS on `images-pending`:** even if a row's storage path leaked into a request, the read-from-pending-bucket policy gates on `auth.uid() = uploader_id OR is_moderator(auth.uid())`. The uploader id is encoded in the storage object path (`{uploader}/{uuid}`) so the policy can compare it without a JOIN to `images`.
3. **`storage.objects` write to `images-approved`:** the public bucket is **only** writable by the admin client. There is no `storage.objects` insert policy granting `authenticated` write access to `images-approved`; the admin-client move is the **single** path by which a file becomes publicly readable. A direct `authenticated` upload into `images-approved` is rejected at the storage layer.

A `pending_media` or `pending_review` row is therefore invisible to anyone other than the uploader and moderators **at three layers** — DB-row visibility, pending-bucket read auth, and approved-bucket write auth — and any one of them holds even if the others are bypassed.

### 3.6 Threat model

| Threat | Mitigation |
|---|---|
| Adversary tries to read another user's pending image via the DB. | `images_select_*` policies gate non-owner reads on `state = 'approved'`. Returns zero rows. |
| Adversary tries to read another user's pending image via the storage bucket directly (knowing the path). | `storage.objects` select policy on `images-pending` gates on `auth.uid() = uploader_id OR is_moderator(auth.uid())`. The path encodes `uploader` so the comparison is local. |
| Adversary tries to mutate someone else's `images` row (e.g. flip state to `approved`). | `images_update_moderator_only` requires `is_moderator(auth.uid())`. Owners cannot self-approve. |
| Adversary uploads a file then deletes the row to destroy evidence. | `images_delete_*` policy is **not granted to the uploader at all**. Only moderators can delete `images` rows (and even that should be rare). The uploader can request rejection via the moderator path; they cannot tombstone their own pending image. |
| Adversary tries to bypass moderation by directly inserting `state = 'approved'`. | `images_insert_self` has `with check (state = 'pending_media' OR state = 'pending_review')` — non-moderator inserts that try to set `approved` are rejected. |
| Adversary tries to upload directly to `images-approved` via the storage API. | `images-approved` has no `storage.objects` insert policy for `authenticated`. Insert is rejected. The admin client (server-only, `SUPABASE_SECRET_KEY`) is the only writer. |
| Adversary tries to enumerate pending UUIDs by guessing storage paths. | Pending paths are `{uploader_uuid}/{image_uuid}`. The image UUID is `gen_random_uuid()` — 122 bits of entropy. Plus the bucket-read RLS gates anyway, so even a correct guess returns 403. |
| Adversary uploads a 10GB file to exhaust storage. | Server Action validates `file.size <= MAX_BYTES` (default 10 MB; constant in `lib/images.ts`) **before** the bucket write. The `IMAGES_UPLOAD` rate limit caps total uploads/hour. Aggregate-byte cap per uploader is noted in §10 as a follow-up. |
| Adversary uploads a malformed file claiming to be an image. | `sharp.metadata()` runs first; if it cannot parse the file as a known image format, the helper returns `invalid_image_type` and no bucket write or row insert occurs. |
| Adversary uploads an image with malicious EXIF (camera profile injection, polyglot). | `sharp` re-encodes pixel data into a canonical jpeg/webp. The output file is freshly written; original metadata (including any malicious EXIF or alternative-color-profile shenanigans) is dropped. |
| Moderator role is granted to the wrong account. | `is_moderator` is set *only* via the Supabase dashboard at MVP (per s3a.1's `profiles_no_privilege_escalation` trigger). No UI to grant. The `is_moderator(uuid)` security-definer helper is the central check; one place to audit. |
| Side-channel: an approved image is rotated back to `rejected` and someone caches the public URL. | Out of scope for this chunk (we do not ship the reverse transition). When the reverse-moderation Bead surfaces, it must also call `cdn purge` on the approved-bucket URL. Note in §10. |

### 3.7 `moderation_decisions` audit table — why ship it now

The Bead's AC does not name `moderation_decisions` explicitly; that table appears in the s3a.6 (moderator queue UI) AC verbatim. We ship it **here** because:

1. The state-machine transitions to `approved` / `rejected` need an audit row at the moment the transition fires. If the table doesn't exist when `markImageApproved` is called from a future moderator UI (whether s3a.6's, an earlier founder-runs-SQL workflow, or s3a.5's CSAM auto-reject), every implementation has to either invent its own audit shape or skip the audit — both bad.
2. The s3a.6 chunk **owns the UI that writes rows**; it does not own the **table schema**. Splitting "schema" from "UI that writes to schema" is the correct seam, just like s3a.1 shipped the `is_moderator` column + `is_moderator(uuid)` function and s3a.6 will *use* it.
3. Type-regen happens once after this migration. If we deferred the table to s3a.6, then s3a.7 (Posts) would need `moderation_decisions` types regenerated again before its consumer code could compile cleanly. Shipping it here keeps the dependency graph clean.

This is consistent with the "ship the substrate, file the dependent slice" lesson from `s3a.1`.

## 4. Schema sketch

Migration: **`supabase/migrations/20260419190000_images_pipeline.sql`**.

### 4.1 Header (mandatory citation block)

```sql
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
--   layers, all of which must agree to publish an image:
--     (1) images RLS: non-owner non-moderator reads gate on state='approved'.
--     (2) storage.objects RLS on images-pending: read gate on
--         auth.uid() = uploader_id OR is_moderator(auth.uid()), with
--         uploader encoded in the object path.
--     (3) storage.objects on images-approved: no client write path; only
--         the server-only admin client (SUPABASE_SECRET_KEY) can move
--         objects from pending → approved. The act of approval IS the move.
--
--   See lib/images.ts for the single legitimate write path (uploadPending-
--   Image / markImageApproved / markImageRejected). Direct insert / update
--   from the client either fails RLS or is gated by is_moderator.
--
-- STATE MACHINE
--   pending_media   ← row inserted after EXIF strip, before CSAM scan
--   pending_review  ← CSAM scan passed; awaiting moderator
--   approved        ← moderator approved; file copied to images-approved
--   rejected        ← moderator rejected; file retained in images-pending
--                     for audit window then deleted (cleanup TODO, see §10
--                     of the plan; not scheduled at MVP).
--
--   pending_media → pending_review is the seam s3a.5 (CSAM scan) wires
--   into. Until s3a.5 ships, lib/images.ts inserts rows directly with
--   state='pending_review'. The pending_media enum value is shipped today
--   to avoid a future `alter type ... add value` rewrite. See TODO(s3a.5)
--   in lib/images.ts.
--
-- THREAT MODEL — abbreviated; full table in .cursor/plans/s3a04_photo_pipeline.plan.md §3.6.
--   1) Read: only uploader + moderator until approved; world after approval.
--   2) Write images table: insert by uploader (state must start as pending);
--      update by moderator only; no client delete path.
--   3) Write storage:
--      - images-pending: uploader insert keyed by path prefix; admin delete.
--      - images-approved: admin write only; world read.
--   4) Outside-the-set requests: RLS denies row reads; storage.objects
--      policies deny bucket reads/writes; admin client requires
--      SUPABASE_SECRET_KEY which never reaches the client bundle (per
--      .cursor/rules/typescript-react.mdc).
--   5) Logs / PII: uploader_id (FK to profiles), storage paths, EXIF-strip
--      timestamp, moderator id on transition. NO image content in logs;
--      NO money fields touched (money-privacy hard rule satisfied by
--      negative — no FK to expenses/expense_shares/payouts).
--
-- OPEN CONSUMERS (deferred to follow-up Beads — wiring contract documented):
--   - tripplanner-s3a.5: writes the pending_media → pending_review transition
--     after CSAM vendor verdict. Failure-closed (vendor outage keeps row in
--     pending_media).
--   - tripplanner-s3a.6: reads getPendingImageQueue(); calls markImageApproved
--     / markImageRejected with reason_code. Writes moderation_decisions rows.
--   - tripplanner-s3a.7: posts.image_ids[] FK to images(id); post visibility
--     gated on every referenced image being state='approved' (or visible to
--     viewer per RLS).
--   - tripplanner-s3a.21: profiles.avatar_image_id FK to images(id) on
--     delete set null.
--   - tripplanner-45u: AI auto-classifier between CSAM and human queue;
--     writes moderation_decisions rows with reviewer_id = NULL +
--     reviewer_kind = 'system'.
-- =============================================================================
```

### 4.2 Enums

```sql
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
```

### 4.3 `images` table

```sql
create table public.images (
  id                 uuid primary key default gen_random_uuid(),
  uploader_id        uuid not null references public.profiles(id) on delete cascade,
  state              public.image_state not null default 'pending_media',
  intended_use       text not null check (intended_use in ('avatar', 'post')),
  pending_path       text not null,             -- storage key in images-pending
  approved_path      text,                      -- storage key in images-approved (set on approve)
  rejection_reason   public.rejection_reason,   -- set on reject
  bytes              integer not null check (bytes > 0 and bytes <= 10485760),  -- 10 MB cap
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
  check (state in ('approved','rejected') = (reviewed_at is not null)),
  check (state in ('approved','rejected') = (reviewed_by is not null))
);

comment on table public.images is
  'User-uploaded images, pre-moderation substrate. See migration header for the hard rule citation and state machine. Bead tripplanner-s3a.4.';

create index images_uploader_id_idx       on public.images (uploader_id);
create index images_state_pending_idx     on public.images (state) where state in ('pending_media', 'pending_review');
create index images_state_approved_idx    on public.images (state) where state = 'approved';
create index images_intended_use_idx      on public.images (intended_use);
```

**Index rationale (each one justified):**

- `images_uploader_id_idx`: every RLS predicate that gates on `auth.uid() = uploader_id` filters by this column.
- `images_state_pending_idx`: `getPendingImageQueue` selects `where state in ('pending_media','pending_review')` and orders by `created_at`. Partial index keeps it tiny (only un-decided rows live in it).
- `images_state_approved_idx`: future consumer queries (avatar render, post render) filter by `state = 'approved'`. Partial.
- `images_intended_use_idx`: lets the moderator queue (s3a.6) render avatar-vs-post differently if useful. Cheap.

### 4.4 `images` RLS policies (one per operation)

```sql
alter table public.images enable row level security;

-- SELECT: approved is world-visible; uploader sees own; moderator sees all.
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

-- UPDATE: only moderators can update an images row. Used by markImageApproved
-- and markImageRejected (called from s3a.6 UI), and by s3a.5 (CSAM scan
-- result) once that lands. The CSAM transition is system-driven and uses the
-- admin client; the admin client bypasses RLS, so the policy doesn't need
-- to anticipate a service-role caller — it just needs to be tight enough that
-- the user-session client cannot self-approve.
create policy "images_update_moderator_only"
  on public.images
  for update
  to authenticated
  using (public.is_moderator(auth.uid()))
  with check (public.is_moderator(auth.uid()));

-- DELETE: moderators only. Uploader cannot tombstone evidence. Audit-window
-- pruning of rejected images runs via the admin client (RLS-bypassing) when
-- a future cleanup Bead lands; not exercised by any client today.
create policy "images_delete_moderator_only"
  on public.images
  for delete
  to authenticated
  using (public.is_moderator(auth.uid()));
```

### 4.5 `moderation_decisions` audit table

```sql
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
  'Append-only audit of every moderation transition. Written by markImageApproved / markImageRejected (s3a.6 UI) and by s3a.5 (CSAM auto-reject) and by tripplanner-45u (AI auto-classifier). Bead tripplanner-s3a.4.';

create index moderation_decisions_image_id_idx     on public.moderation_decisions (image_id);
create index moderation_decisions_reviewer_id_idx  on public.moderation_decisions (reviewer_id) where reviewer_id is not null;
create index moderation_decisions_created_at_idx   on public.moderation_decisions (created_at desc);
```

### 4.6 `moderation_decisions` RLS policies (one per operation)

```sql
alter table public.moderation_decisions enable row level security;

-- SELECT: moderators see all; the original uploader can see their own image's
-- decisions (so the UI can render "your image was rejected because <reason>").
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
-- System rows (CSAM, AI) are written by the admin client and bypass RLS; that
-- is fine because the admin client is server-only.
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
```

### 4.7 Storage buckets + `storage.objects` policies

```sql
-- Buckets ---------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
  ('images-pending',  'images-pending',  false),
  ('images-approved', 'images-approved', true)
on conflict (id) do nothing;

-- Policies on storage.objects ------------------------------------------
-- Object-key convention (encoded by lib/images.ts):
--   images-pending/{uploader_uuid}/{image_uuid}.{ext}
--   images-approved/{image_uuid}.{ext}
--
-- The uploader uuid being the FIRST path segment is what lets the
-- pending-bucket SELECT policy gate read access without a JOIN to images.

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
--     server-action wrapper is also enforced via lib/images.ts which
--     short-circuits on file size and EXIF-strip failure before this
--     write happens; the policy is the second line of defense.
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
--     cleanup. No update/delete policy.

-- (4) Approved bucket: world-readable. The bucket is public=true so the
--     CDN serves objects directly; we still want an explicit select policy
--     so the model is documented in code rather than implicit in the
--     bucket flag.
create policy "storage_approved_select_world"
  on storage.objects
  for select
  to authenticated, anon
  using (bucket_id = 'images-approved');

-- (5) Approved bucket: NO insert/update/delete policy for any client role.
--     Only the admin client (SUPABASE_SECRET_KEY) can write here, via the
--     service-role's RLS bypass. This is the single chokepoint that makes
--     "moderator approval IS the publication event" mechanically true.

comment on policy "storage_pending_select_uploader_or_moderator" on storage.objects is
  'Image pre-moderation hard rule (.cursor/rules/supabase-security.mdc #2): pending images are visible only to the uploader and moderators. Path-prefix-based to avoid a JOIN to public.images.';
comment on policy "storage_approved_select_world" on storage.objects is
  'Approved images are world-readable; the act of approval is the admin-client move from images-pending to images-approved. The absence of any insert/update/delete policy here is intentional.';
```

## 5. Helpers — `lib/images.ts`

Server-only module. Mirrors the shape of `lib/follows.ts`, `lib/blocks.ts`, `lib/profiles.ts`. All public functions return discriminated-union result types — never throw across the trust boundary.

### 5.1 EXIF strip choice

**Recommendation: `sharp` in the Server Action.**

- **What it does:** reads the file via `sharp(buffer)`, strips ALL metadata implicitly when it re-encodes (`sharp` re-encodes by default unless told otherwise), normalizes orientation, and outputs a canonical jpeg or webp.
- **Tradeoffs:**
  - **Pro:** native (libvips under the hood), fast, ubiquitous, already supported by Vercel's Next.js runtime. Removes EXIF GPS *and* every other piece of metadata in one step. Re-encodes pixel data so polyglot/PDF-as-jpg attacks don't survive. Validates the file is actually an image as a side effect.
  - **Pro:** the strip is local to the Server Action — no extra Edge Function hop, no extra latency, no extra deploy surface.
  - **Con:** `sharp` adds ~10MB to the server bundle. Acceptable for a server-only path; not in any client bundle.
  - **Con:** `sharp` requires native binaries; the Vercel Node runtime ships them, but a future move to Edge runtime would force a switch. The interface in `lib/images.ts` does not leak `sharp` types, so a future swap (e.g. to a Wasm-based encoder, or an Edge Function call) is local to one function body.
- **Alternative considered: `exifr`** (read-only metadata) — rejected because it does not re-encode, so it cannot strip a malicious color-profile or polyglot. Useful for *checking* metadata; not for stripping.
- **Alternative considered: a Supabase Edge Function** — rejected at MVP because it adds an extra deploy surface and an extra failure mode for marginal benefit. Revisit when scale or runtime constraints demand it.
- **Alternative considered: deferred to s3a.5** — explicitly rejected. The hard rule says EXIF strip happens *before* any row exists. Coupling EXIF strip to the CSAM vendor would let CSAM-vendor outage block uploads at a step where the image still has location data on disk. Two independent failure modes is the correct shape.

### 5.2 Module skeleton (signatures only)

```ts
import "server-only";

import sharp from "sharp";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import type { Database } from "@/database.types";

export type ImageRow = Database["public"]["Tables"]["images"]["Row"];
export type ImageState = Database["public"]["Enums"]["image_state"];
export type RejectionReason = Database["public"]["Enums"]["rejection_reason"];

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB; mirrors images.bytes CHECK constraint
const ACCEPTED_MIME = ["image/jpeg", "image/webp", "image/png"] as const;

export type UploadResult =
  | { ok: true; image: ImageRow }
  | {
      ok: false;
      error:
        | "rate_limited"
        | "invalid_image_type"
        | "file_too_large"
        | "exif_strip_failed"
        | "storage_failed"
        | "unauthorized"
        | "unknown";
      retryAfterSeconds?: number;
    };

export type ApproveResult =
  | { ok: true; image: ImageRow }
  | { ok: false; error: "not_found" | "wrong_state" | "storage_failed" | "unauthorized" | "unknown" };

export type RejectResult =
  | { ok: true; image: ImageRow }
  | { ok: false; error: "not_found" | "wrong_state" | "unauthorized" | "unknown" };

/**
 * Server-only upload entrypoint. Called by per-consumer Server Action wrappers
 * (s3a.21 avatar, s3a.7 post composer). Runs the rate-limit gate, the EXIF
 * strip, the bucket put, and the row insert atomically-ish (failures roll back
 * forward — see implementation notes in §5.3).
 *
 * TODO(s3a.5): once CSAM scan lands, this helper inserts state='pending_media'
 * and the s3a.5 entrypoint moves it to 'pending_review' on scan-pass. Until
 * then, this helper inserts directly with state='pending_review'.
 */
export async function uploadPendingImage(
  file: File,
  opts: { uploaderId: string; intendedUse: "avatar" | "post" },
): Promise<UploadResult>;

/**
 * Fetch an image row by id. Respects RLS — pending images return null for
 * non-uploader, non-moderator viewers. Used by per-consumer render paths and
 * by the moderator queue UI (s3a.6).
 */
export async function getImageById(id: string): Promise<ImageRow | null>;

/**
 * Approve an image. Only callable by moderators (RLS rejects others; the
 * helper also short-circuits on `is_moderator` for a clearer error message).
 *
 * Side effects, in order: (1) admin-client copy from images-pending to
 * images-approved, (2) UPDATE images.state to 'approved' + set approved_path
 * + reviewed_at + reviewed_by, (3) INSERT moderation_decisions row, (4) admin-
 * client delete of the pending object. Failures and idempotency rules in §10.
 *
 * Called by tripplanner-s3a.6 (moderator queue UI).
 */
export async function markImageApproved(
  id: string,
  opts: { moderatorId: string; notes?: string },
): Promise<ApproveResult>;

/**
 * Reject an image. Side effects: (1) UPDATE images.state to 'rejected' + set
 * rejection_reason + reviewed_at + reviewed_by, (2) INSERT moderation_decisions
 * row. The pending file is RETAINED in images-pending for the audit window
 * and pruned by a future cleanup job (see §10). Idempotency rules in §10.
 *
 * Called by tripplanner-s3a.6 (moderator queue UI).
 */
export async function markImageRejected(
  id: string,
  opts: { moderatorId: string; reason: RejectionReason; notes?: string },
): Promise<RejectResult>;

/**
 * Read the moderator review queue, ordered by oldest-first. Caller must be a
 * moderator; the underlying RLS already enforces this, but the helper checks
 * up-front so the error path is clean.
 *
 * Called by tripplanner-s3a.6.
 */
export async function getPendingImageQueue(
  opts?: { limit?: number; intendedUse?: "avatar" | "post" },
): Promise<ImageRow[]>;
```

### 5.3 Implementation notes

- `uploadPendingImage` order: `withRateLimit` → file-size + mime check → `sharp` strip + re-encode (returns a canonical buffer + new mime) → admin-client `putObject` into `images-pending/{uploaderId}/{uuid}.{ext}` → user-session `insert` into `images` (RLS-checked; honors the `images_insert_self_pending` policy). Failures: if the bucket put succeeds but the row insert fails (e.g. unique-violation, RLS surprise), call admin-client `delete` on the bucket object before returning the error so we don't leave orphaned bytes.
- `markImageApproved` order: read-and-verify the row (must be in `pending_review`) → admin-client `copy` from pending to approved → admin-client UPDATE `images` set state, approved_path, reviewed_at, reviewed_by → INSERT `moderation_decisions` (verdict='approve', reviewer_kind='human') → admin-client `delete` pending object. Idempotency in §10.
- `markImageRejected` order: read-and-verify (must be in `pending_review`) → admin-client UPDATE → INSERT `moderation_decisions` (verdict='reject', reviewer_kind='human', reason). Pending file stays for audit window.
- All four mutating helpers use the **admin client** (`lib/supabase/admin.ts`) for the storage-side operations (cross-bucket copy / delete) because `storage.objects` policies on `images-approved` deliberately do not grant any client role write access. The DB-side updates could in principle run through the user-session client (RLS allows moderator updates), but using the admin client for the whole transition keeps the failure modes uniform and avoids a half-applied state where the user-session client succeeded on the row but the admin client failed on the bucket.

### 5.4 `lib/supabase/admin.ts` (new module)

```ts
import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/database.types";

/**
 * Server-only Supabase client carrying the SECRET key (sb_secret_* /
 * SUPABASE_SECRET_KEY). RLS-bypassing. Use ONLY for operations that
 * legitimately need to bypass RLS, e.g. cross-bucket storage moves on
 * moderator approval.
 *
 * Hard rule (.cursor/rules/supabase-security.mdc): never reachable from a
 * "use client" module. The boundary `rg` for SUPABASE_SECRET_KEY / sb_secret_
 * should match this file (and only this file) under lib/.
 *
 * Do NOT export the client at module scope (a long-lived process holds the
 * secret in memory regardless, but per-call construction makes the chokepoint
 * grep-able and avoids accidental top-level imports).
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
}
```

### 5.5 Cross-chunk file: `lib/rate-limit.ts`

Add one entry to the `RATE_LIMITS` constant (additive — no signature change):

```ts
export const RATE_LIMITS = {
  // ... existing entries ...
  IMAGES_UPLOAD: { surface: "images_upload", max: 10, windowSeconds: 60 * 60 },
} as const;
```

Mirror the `images_upload = 10 per hour (image pre-moderation throttle)` line in the `rate_limits` migration's threshold-defaults comment block — **but not by editing that historical migration file**. Per the migration-immutability lesson, leave the comment in `20260419050100_rate_limits.sql` as is, and document the new threshold in this chunk's migration header instead. The threshold is the source of truth in the TS constant; the migration comment is informational.

## 6. UI surface in this chunk

**None.**

This is justified against the [s3a.2 lesson](../../tasks/lessons.md) ("default to the smallest end-to-end slice"): that lesson cuts against pure-substrate chunks **when an existing UI surface can exercise the new substrate end-to-end**. In this chunk, the candidate end-to-end surfaces are:

- An avatar upload UI on `/profile` or onboarding — **belongs to `tripplanner-s3a.21`**, which adds `profiles.avatar_image_id` and the avatar UX in one coherent chunk. Pulling that surface forward into this chunk would either (a) leave the FK column unwired, recreating the s3a.1 lesson exactly, or (b) require shipping s3a.21's whole UI surface here, ballooning the chunk.
- A post composer with attached photos — **belongs to `tripplanner-s3a.7`**, which depends on `s3a.3` (trip visibility) AND on this chunk AND on s3a.5 AND on s3a.6 — all of which are P0 gates for the Posts feature.
- A standalone "test upload" page — explicitly bad. The hard rule says *no image is visible until human-approved*. A test upload page would either (a) skip the human approval (violates the rule), (b) require the moderator UI (s3a.6) to exist first (pulls dependency forward), or (c) ship as user-upload-then-vanish (no proof of life, worse than the SQL smoke test).

**The proof-of-life for this chunk is therefore:**

1. `pnpm tsc --noEmit` + `pnpm lint` clean.
2. `supabase db push --linked` clean.
3. `supabase gen types typescript --linked > database.types.ts` regenerates the `images`, `moderation_decisions`, `image_state`, `rejection_reason`, `moderation_verdict`, `moderation_actor_kind` types.
4. The smoke-test SQL block in §7 confirms RLS shapes work as designed.
5. **The downstream Beads light up** when they ship — s3a.21's avatar upload exercises `uploadPendingImage`, s3a.6's queue UI exercises `getPendingImageQueue` + `markImageApproved` / `markImageRejected`. Until then, this chunk has zero user-visible footprint, and that is the correct answer for an infrastructure substrate that the hard rule actively forbids us from exercising via a test surface.

This is the case the s3a.2 lesson explicitly carved out: "Pure-substrate chunks should be reserved for cases where literally no UI surface can exercise the new code." That is exactly this chunk.

## 7. Verification

### 7.1 Local

- `pnpm tsc --noEmit` exit 0.
- `pnpm lint` exit 0.
- `ReadLints` clean on every touched file.
- Boundary `rg` (zsh: install ripgrep first or use Cursor's Grep tool):
  ```
  rg -n 'SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|sb_secret_' app/ components/ lib/ proxy.ts
  ```
  Expected: matches **only** in `lib/supabase/admin.ts` and existing doc comments. Any match under `app/` or under any `"use client"` module is a fail.

### 7.2 Migration push (parent agent)

- `supabase db push --linked` applies `20260419190000_images_pipeline.sql` cleanly.
- Confirm `image_state`, `rejection_reason`, `moderation_verdict`, `moderation_actor_kind` enums exist; `images` and `moderation_decisions` tables exist; both buckets exist (`select id, public from storage.buckets where id like 'images-%';` returns two rows).

### 7.3 Type regen

- `supabase gen types typescript --linked > database.types.ts`.
- `Database["public"]["Tables"]["images"]` has the expected columns.
- `Database["public"]["Tables"]["moderation_decisions"]` has the expected columns.
- `Database["public"]["Enums"]["image_state"]` is the four-value union.
- Cleanup any local type-narrowing in `lib/images.ts` that the subagent added before types existed; rerun `pnpm tsc --noEmit` afterwards.

### 7.4 RLS smoke-test SQL (parent agent runs after push)

Executed via Supabase SQL editor or `psql`. Uses `set local role` to simulate different callers without minting real JWTs.

```sql
-- Setup: pick three real profile uuids for the smoke test.
--   :u_a = a regular profile (uploader)
--   :u_b = a regular profile (random viewer)
--   :u_m = the founder profile, with is_moderator = true
-- Assumes those profiles already exist (s3a.1 onboarding shipped).

-- Insert a pending image as user A (simulated).
insert into public.images (uploader_id, intended_use, pending_path, bytes, mime_type)
values (:'u_a', 'avatar', :'u_a' || '/smoke-test-uuid.jpg', 1024, 'image/jpeg')
returning id, state;
-- Expect: 1 row, state = 'pending_media' (or 'pending_review' until s3a.5 lands).

-- Read as user B: must return zero rows.
select set_config('request.jwt.claim.sub', :'u_b', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select count(*) from public.images where uploader_id = :'u_a';
-- Expect: 0.

-- Read as user A: must see their own row.
select set_config('request.jwt.claim.sub', :'u_a', true);
select count(*) from public.images where uploader_id = :'u_a';
-- Expect: 1.

-- Read as moderator: must see the row.
select set_config('request.jwt.claim.sub', :'u_m', true);
select count(*) from public.images where uploader_id = :'u_a';
-- Expect: 1.

-- Read as anon (no JWT): must return zero rows.
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
set local role anon;
select count(*) from public.images where uploader_id = :'u_a';
-- Expect: 0.

-- Cleanup.
reset role;
delete from public.images where pending_path like :'u_a' || '/smoke-test-%';
```

If `set local role` is awkward in the dashboard, the equivalent `select` queries via the `supabase-js` client with three different sessions also prove it; the SQL form is documented because it is the cheapest reproducible artifact.

### 7.5 Money-privacy negative

```
rg -n 'expenses|expense_shares|payouts' supabase/migrations/20260419190000_images_pipeline.sql
```

Expected: zero matches. The `images` and `moderation_decisions` tables never reference monetary tables.

### 7.6 Hard-rule citation present

```
rg -n 'image pre-moderation hard rule|supabase-security\.mdc' supabase/migrations/20260419190000_images_pipeline.sql
```

Expected: at least one match in the header comment block.

## 8. Bead bookkeeping

### 8.1 New Beads to file

The substrate is intentionally complete; the consumer Beads (`s3a.5`, `s3a.6`, `s3a.7`, `s3a.21`, `s3a.45u`) all already exist. Two **optional** follow-ups, file at parent-agent discretion:

- **`tripplanner-s3a.26` (proposed):** _infra: rejected-image audit-window cleanup job_. P3, parent `s3a`, blocked-by `s3a.4`. Daily / weekly job that prunes `images-pending` storage objects + their `images` rows where `state = 'rejected' AND reviewed_at < now() - interval '<window>'`. Window length is a policy decision deferred to the cleanup chunk. Filed only if the parent agent agrees the cleanup is worth tracking explicitly; otherwise leave it as the documented note in §10.
- **`tripplanner-s3a.27` (proposed):** _infra: aggregate-byte cap per uploader_. P3, parent `s3a`, blocked-by `s3a.4`. Adds an aggregate-bytes-per-uploader cap on top of `IMAGES_UPLOAD` rate limit. Filed only if the parent agent agrees; otherwise §10 note suffices.
- **No "EXIF strip vendor decision" Bead is needed.** The choice (`sharp`) is documented here; alternatives are listed; future re-evaluation is an ADR if it crosses the boundary.

### 8.2 Notes to append to existing downstream Beads

Mirror the wiring contract in each consumer's body so the next agent picking up that chunk sees the seam:

- **`tripplanner-s3a.5`** — Append: _Hooks into the `pending_media → pending_review` transition shipped in `s3a.4`. The TODO(s3a.5) seam lives in `lib/images.ts` `uploadPendingImage` (rewrite the helper to insert with `state='pending_media'` and call into the s3a.5 vendor wrapper, then UPDATE to `pending_review` on pass). Failure-closed (vendor outage keeps row in `pending_media`, never reaches a moderator). Writes a `moderation_decisions` row on auto-reject (verdict='reject', reviewer_kind='system', reason='csam', confidence)._
- **`tripplanner-s3a.6`** — Append: _Reads the queue via `getPendingImageQueue()` from `lib/images.ts` (s3a.4). Approve/reject keyboard shortcuts call `markImageApproved` / `markImageRejected` from the same module. The `moderation_decisions` table already exists (shipped in s3a.4) and the helpers already write the row — your code calls the helpers, you do not construct decision rows directly._
- **`tripplanner-s3a.7`** — Append: _Posts reference images via a join table (or `posts.image_ids uuid[]` per s3a.7's design choice; recommend the join table for FK integrity). Post visibility derives from the parent Trip's visibility AND from every referenced image being readable by the viewer (i.e. `state='approved'` for non-uploader non-moderator viewers). The composer uploads via `uploadPendingImage(file, { uploaderId, intendedUse: 'post' })` from `lib/images.ts`. Required alt-text lives on the post-image join row, not on `images` (alt text is per-use, not per-image)._
- **`tripplanner-s3a.21`** — Append: _Adds `profiles.avatar_image_id uuid references public.images(id) on delete set null` in its own migration. Avatar upload UI calls `uploadPendingImage(file, { uploaderId, intendedUse: 'avatar' })`. Profile pages render `<img src=... />` only when the referenced row is `state='approved'` (the RLS select on `images` already returns null otherwise; render the monogram fallback per the project-ui-ux skill in that case)._
- **`tripplanner-45u`** — Append: _Plugs in between CSAM scan (s3a.5) and the human queue (s3a.6). Above the high-confidence threshold, write a `moderation_decisions` row with reviewer_kind='system', reviewer_id=null, confidence=<value>, and either UPDATE `images.state` straight to 'approved' (with the bucket move via `markImageApproved`'s implementation pattern) or to 'rejected'. Below the threshold, leave the row in 'pending_review' so the human queue picks it up. The substrate is unchanged._

### 8.3 Close `tripplanner-s3a.4`

After parent-agent verification, close with a note: _Substrate shipped: `images` + `moderation_decisions` + 4-state enum + two buckets + RLS at three layers; `lib/images.ts` + `lib/supabase/admin.ts` + `IMAGES_UPLOAD` rate-limit entry. EXIF strip via `sharp` server-side. CSAM seam (TODO(s3a.5)) marked. No UI surface in this chunk by design (see §6); proof-of-life via SQL smoke + downstream Beads when they ship._

## 9. File-scope contract for the implementation subagent

Strict per [project-orchestration → Parallel chunks](../../.cursor/skills/project-orchestration/SKILL.md). The subagent OWNS exactly what is listed below and MUST NOT TOUCH anything else.

### 9.1 OWNS

- `supabase/migrations/20260419190000_images_pipeline.sql` (new)
- `lib/images.ts` (new)
- `lib/supabase/admin.ts` (new)
- `lib/rate-limit.ts` (modify — add the single `IMAGES_UPLOAD` entry to `RATE_LIMITS`; do not change any other line)
- `package.json` + `pnpm-lock.yaml` (modify — `pnpm add sharp`; if a dev type only is needed, `pnpm add -D @types/sharp` — `sharp` ships its own types, so this likely isn't needed; verify)

### 9.2 MUST NOT TOUCH

- **Every existing file under `supabase/migrations/`** (immutable per the migration-immutability lesson). In particular: `20260419013009_profiles.sql`, `20260419045026_follows.sql`, `20260419050000_blocks_mutes.sql`, `20260419050100_rate_limits.sql`. **Do not edit comments. Do not "tidy up". The hash is the contract.**
- **Every other `lib/*.ts` file** except `lib/rate-limit.ts` (the one cross-chunk addition). Specifically: `lib/profiles.ts`, `lib/follows.ts`, `lib/blocks.ts`, `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/middleware.ts`.
- **Every `app/**` file.** No UI in this chunk.
- **`database.types.ts`** — the parent agent regenerates this once after `supabase db push`. Do not hand-edit.
- **`proxy.ts`, `app/layout.tsx`, `app/globals.css`** — no chrome / layout / style changes.
- **`.env.local` / `.env.local.example`** — `SUPABASE_SECRET_KEY` is already documented in `.env.local.example` (commented out). The user may need to uncomment + set the value before `lib/supabase/admin.ts` works in dev; that is a runtime config concern, not a source change.
- **`tasks/todo.md` / `tasks/lessons.md`** — parent agent owns the session scratchpad and lesson log.

### 9.3 Pre-allocated migration timestamp

**`20260419190000_images_pipeline.sql`** — strictly later than every existing migration; leaves room for any concurrent chunk that may pre-allocate a different timestamp under the same parent-agent session.

### 9.4 Subagent stop-line

Per the parallel-chunks contract: the subagent implements, runs `pnpm tsc --noEmit` and `pnpm lint`, and reports back. The subagent **does not** run `supabase db push`, **does not** regenerate `database.types.ts`, **does not** create commits. The parent agent sequences those after every concurrent subagent has reported.

If `lib/images.ts` needs a temporary type narrowing (e.g. `as Database["public"]["Tables"]["images"]["Row"]` cast where the regenerated types don't yet exist at code-write time), the subagent leaves a `// TODO(parent-agent): remove after type regen` comment. The parent agent removes it during the type-regen pass per the orchestration skill.

## 10. Risks and open decisions

### 10.1 EXIF strip choice

**Decision recommended in §5.1: `sharp`.** Document the choice in the migration header AND in `lib/images.ts`'s top comment so a future agent doesn't have to spelunk for the rationale. Revisit only if (a) the runtime moves to Edge, (b) `sharp` introduces a transitive supply-chain concern, or (c) image throughput exceeds what one Server Action invocation can handle.

### 10.2 Two-bucket vs one-bucket

**Decision recommended in §3.4: two buckets.** Defense in depth + CDN reachability + audit clarity. Revisit if the operational cost of the cross-bucket move ever becomes a bottleneck (extremely unlikely at the moderation throughput a human queue can sustain).

### 10.3 Ship `moderation_decisions` in this chunk vs s3a.6

**Decision recommended in §3.7: ship in this chunk.** State-machine transitions need it; type regen flows cleaner; matches the s3a.1 / `is_moderator` seam pattern.

### 10.4 Idempotency of `markImageApproved` / `markImageRejected`

**Risk:** a moderator clicks Approve, the bucket copy succeeds, the DB UPDATE succeeds, the audit insert fails. What now? Or: the moderator double-clicks and we attempt approval twice.

**Recommendations (to be implemented in §5.3 helpers):**

- **Pre-check.** Read the row; if `state` is already `approved` or `rejected`, return `{ ok: false, error: 'wrong_state' }` (or `{ ok: true, image }` with a no-op flag — TBD; pre-check + state guard is defensible either way).
- **Atomicity.** The DB UPDATE + audit INSERT should run inside a single Postgres transaction (via an RPC, or via a `with` statement, or via the `supabase-js` client's chained operations — pick the cheapest in implementation). The bucket copy runs *before* the transaction; the bucket delete (of the pending object) runs *after*. This means a partial failure between bucket copy and DB UPDATE leaves a duplicate object in the approved bucket; the next attempt finds the row in `approved` and returns `wrong_state` without redoing the copy. Acceptable: the duplicate is invisible until the row references it.
- **Bucket-delete failure.** If the pending-bucket delete fails after the rest succeeds, log the error and return `{ ok: true }`. The orphaned pending object will be cleaned by the rejected-cleanup job (file as Bead, see §8.1). The moderation-decision audit is the source of truth.
- **Race with two moderators.** Vanishingly unlikely at a one-moderator MVP. The pre-check + DB-side state CHECK constraints make a double-approval a no-op (second attempt finds the row in `approved` and short-circuits). Document as accepted.

### 10.5 Storage cost ceiling

Aggregate-bytes-per-uploader cap is **not in this chunk.** The `IMAGES_UPLOAD` rate limit (10/hour) bounds upload count, and the per-image `bytes <= 10_485_760` CHECK bounds individual size. Worst-case per uploader: 10 * 10MB = 100MB/hour = 2.4GB/day. Acceptable at MVP. Note in §8.1 as the optional `tripplanner-s3a.27` Bead.

### 10.6 Open future concerns (not blockers; recorded for the next agent)

- **CDN purge on reverse-moderation.** If a future Bead allows demoting `approved → rejected`, the approved-bucket public URL must be CDN-purged. Out of scope here; called out in `s3a.4`'s close note so it cannot be silently shipped.
- **Migration push in parallel with another chunk that also touches `lib/rate-limit.ts`.** `RATE_LIMITS` is the one cross-chunk file. Pre-flight check: `git status` clean of any other in-flight edit to `lib/rate-limit.ts` before launching. If any other parallel chunk plans to add a different `RATE_LIMITS` entry, sequence them — do not parallelize them per the file-scope contract.
- **`SUPABASE_SECRET_KEY` not set in dev `.env.local`.** The repo's `.env.local.example` has the line commented out. The `lib/supabase/admin.ts` chokepoint is loaded lazily (per-call, not at module top), so the absence at boot is not fatal — but the first call to `markImageApproved` / `markImageRejected` / `uploadPendingImage` (the latter uses admin for the bucket put) will throw. Document this in the chunk's close note so the parent agent can prompt the founder to set the value before any consumer chunk lands.
