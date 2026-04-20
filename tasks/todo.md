# Three parallel social-substrate chunks: photo pipeline + trip visibility + ToS gate

**Active Beads — all closed in this session, in dependency order:**

- [`tripplanner-s3a.4`](#) — _infra: photo storage pipeline + pending_review state machine_, P1, parent `tripplanner-s3a`. Substrate for the AGENTS.md / ADR 0002 hard rule that every uploaded image is invisible until a human moderator approves it.
- [`tripplanner-s3a.3`](#) — _feat: trip visibility model (private | unlisted | public) + RLS_, P1, parent `tripplanner-s3a`. Adds the trip + trip_members tables that the rest of the social loop (Posts, join requests, DMs) hangs off, plus a "Your trips" section on the home page.
- [`tripplanner-s3a.24`](#) — _feat: ToS acceptance gate at signup_, P1, parent `tripplanner-s3a`. Records explicit ToS + Community Guidelines + Privacy acceptance per profile per version, masked-IP + truncated-UA, gated at handle creation.

**Plans:** [`s3a04_photo_pipeline.plan.md`](../.cursor/plans/s3a04_photo_pipeline.plan.md), [`s3a03_trip_visibility.plan.md`](../.cursor/plans/s3a03_trip_visibility.plan.md), [`s3a24_tos_gate.plan.md`](../.cursor/plans/s3a24_tos_gate.plan.md).

## Plan

### Pre-flight (parent agent)

- [x] **scope-check** — Confirmed zero file overlap across the three chunks. Pre-allocated three non-conflicting migration timestamps (`20260419190000_images_pipeline.sql`, `20260419190100_trips_visibility.sql`, `20260419190200_tos_acceptances.sql`).
- [x] **rate-limit pre-allocation** — Both s3a.4 (`IMAGES_UPLOAD`) and s3a.24 (`TOS_ACCEPT`) needed a new entry in [`lib/rate-limit.ts`](../lib/rate-limit.ts). Parent agent pre-allocated both entries in a separate prep commit so neither subagent had to touch the file in parallel. Subagents instructed to consume the existing constants only.
- [x] **stop-before-orchestration rule** — Subagents told explicitly to stop before `supabase db push`, `gen types`, and `git commit`. Parent agent owns the merge sequence.

### s3a.4 — photo storage pipeline + pre-moderation gate

- [x] **migration** — [`supabase/migrations/20260419190000_images_pipeline.sql`](../supabase/migrations/20260419190000_images_pipeline.sql): `images` table (4-state machine: `pending_media → pending_review → approved | rejected`), `moderation_decisions` audit table, four enums, RLS on both tables, two storage buckets (`images-pending` private uploader+moderator-only via `storage.objects` RLS; `images-approved` public-read write-only-by-admin-client). Three orthogonal layers (images RLS + storage.objects RLS on pending + write-only-by-admin-client on approved) satisfy the AGENTS.md hard rule.
- [x] **lib** — [`lib/images.ts`](../lib/images.ts) (server-only): `uploadPendingImage` (sharp EXIF strip + re-encode → bucket put → row insert → rollback on insert failure), `getImageById`, `markImageApproved` (cross-bucket move + audit), `markImageRejected` (state flip + audit + retain pending bytes), `getPendingImageQueue` (moderator-only). Throttled via `RATE_LIMITS.IMAGES_UPLOAD` (10/hour). Inserts directly as `pending_review` for now; s3a.5 (CSAM scan) reintroduces `pending_media`.
- [x] **admin client** — [`lib/supabase/admin.ts`](../lib/supabase/admin.ts) (server-only): first `SUPABASE_SECRET_KEY` consumer in the repo, used for cross-bucket moves and admin-client writes to `images-approved`. `import "server-only"` enforced.
- [x] **dependency** — Added `sharp ^0.34.5` to [`package.json`](../package.json).

### s3a.3 — trip visibility model + minimal home-page surface

- [x] **migration** — [`supabase/migrations/20260419190100_trips_visibility.sql`](../supabase/migrations/20260419190100_trips_visibility.sql): `trips` + `trip_members` tables, `trip_visibility` (`private | unlisted | public`) + `trip_member_role` (`organizer | member`) enums. RLS on `trips_select` covers organizer / member / `visibility = 'public'` / `visibility = 'unlisted' AND id is known`; RLS on `trip_members_select` keeps the membership list members-only. Money-privacy hard rule preserved (no monetary tables in this chunk).
- [x] **policy seam closure** — Drop-and-recreate of `profiles_select_discoverable_or_self` in this new migration adds the co-trip-members branch so members can resolve each other's display name + avatar. Historical `20260419100000_profiles.sql` left untouched (migration immutability discipline).
- [x] **lib** — [`lib/trips.ts`](../lib/trips.ts) (server-only): `listTripsForViewer`, `getTripById`, `getTripMembers`, `isTripMember`. RLS-gated reads under the caller's session. No write helpers in this chunk — they land in the new follow-up `tripplanner-718`.
- [x] **ui** — [`app/page.tsx`](../app/page.tsx) gains a "Your trips" section above the discover-people section. Additive only.

### s3a.24 — ToS acceptance gate

- [x] **migration** — [`supabase/migrations/20260419190200_tos_acceptances.sql`](../supabase/migrations/20260419190200_tos_acceptances.sql): `tos_acceptances` table (`profile_id`, `version`, `accepted_at`, `ip`, `user_agent`) with `select_own` + `select_moderator` + `insert_own` RLS.
- [x] **lib** — [`lib/legal.ts`](../lib/legal.ts) pins `CURRENT_TOS_VERSION` (bump to invalidate prior acceptances). [`lib/tos.ts`](../lib/tos.ts) exposes `acceptCurrentTos` + `hasAcceptedCurrentTos`. IP masked to /24 (IPv4) or /48 (IPv6); user-agent truncated to 256 chars in TS before insert. Throttled via `RATE_LIMITS.TOS_ACCEPT` (10/hour).
- [x] **wire-up** — [`app/onboarding/handle/handle-form.tsx`](../app/onboarding/handle/handle-form.tsx) requires the checkbox; [`app/onboarding/handle/actions.ts`](../app/onboarding/handle/actions.ts) refuses to create the profile until the checkbox is checked, then records the acceptance in the same flow. [`app/onboarding/handle/page.tsx`](../app/onboarding/handle/page.tsx) surfaces a clean error message when the gate fails.

### Orchestration (sequential, parent agent)

- [x] **parallel-implement** — Three subagents launched in one message (one per chunk) with non-overlapping file scopes and pre-allocated migration timestamps + pre-allocated rate-limit constants.
- [x] **fix-storage-comment-permission-error** — `supabase db push` initially failed because the s3a.4 subagent included `comment on policy "storage_pending_..." on storage.objects` statements; the migration role lacks ownership over the `storage.objects` table (owned by `supabase_storage_admin`). Removed the four `comment on policy` lines and replaced with an explanatory comment block in the migration. Push then succeeded.
- [x] **push-migrations** — `supabase db push --linked` applied all three migrations in order to the linked project. Clean.
- [x] **regenerate-types** — `supabase gen types typescript --linked > database.types.ts`. Hand-trimmed two stray `supabase` CLI status lines from the file ("Initialising login role..." prepended; CLI update notice appended). Confirmed `images`, `moderation_decisions`, `tos_acceptances`, `trips`, `trip_members` tables and `image_state`, `rejection_reason`, `moderation_verdict`, `trip_visibility`, `trip_member_role` enums all present.
- [x] **cleanup-temp-types** — Removed local type augmentations from [`lib/images.ts`](../lib/images.ts), [`lib/trips.ts`](../lib/trips.ts), [`lib/tos.ts`](../lib/tos.ts) (the `LocalImage*` / `LocalModeration*` / `ExtendedDatabase` / `withImagesTypes` / `withTosTypes` / `getClient` workarounds). All three modules now consume the regenerated `Database` types directly.
- [x] **typecheck + lint** — `pnpm tsc --noEmit` exit 0; `pnpm lint` exit 0.
- [x] **commits** — Four commits in dependency order: prep (rate-limit pre-allocation) → s3a.4 (photo pipeline + database.types.ts regen) → s3a.3 (trips) → s3a.24 (ToS).
- [x] **bead-bookkeeping** — Closed `tripplanner-s3a.4`, `tripplanner-s3a.3`, `tripplanner-s3a.24`. Filed `tripplanner-718` (trip create/update/leave Server Actions + detail page, discovered-from `s3a.3`) and `tripplanner-u4c` (rejected/orphaned pending-bucket cleanup job, discovered-from `s3a.4`).
- [x] **todo-review-lessons** — this file; lesson appended below.

## Review

### Evidence

- **Typecheck:** `pnpm tsc --noEmit` exit 0 after temp-type cleanup.
- **Lint:** `pnpm lint` exit 0 (no warnings).
- **DB push:** `supabase db push --linked` applied all three migrations cleanly to the linked project (after dropping the disallowed `comment on policy ... on storage.objects` lines).
- **Type regen:** [`database.types.ts`](../database.types.ts) regenerated; `images` (line 109), `moderation_decisions` (line 187), `tos_acceptances` (line 331), `trip_members` (line 358), `trips` (line 394) tables and the five new enums all present.
- **Migration immutability:** `git diff HEAD -- supabase/migrations/20260419100000_profiles.sql` shows zero changes to the historical profiles migration; the s3a.3 migration's drop-and-recreate of `profiles_select_discoverable_or_self` lives entirely in `20260419190100_trips_visibility.sql`.
- **Money-privacy hard rule:** none of the three migrations touch monetary tables. `trips` carries no monetary fields. `lib/trips.ts` has no money-related helpers.
- **Image pre-moderation hard rule:** `images-pending` bucket is private with uploader+moderator-only `storage.objects` RLS; `images-approved` is public-read but write-only-by-admin-client; `images` table RLS denies `state in ('pending_media','pending_review')` reads to non-uploader, non-moderator viewers. Three orthogonal layers as required.

### Lenses

- **Architecture:** RLS-first across all three migrations; `lib/supabase/admin.ts` is the first `SUPABASE_SECRET_KEY` consumer in the repo and is `import "server-only"` enforced. The s3a.4 substrate uses three orthogonal layers (images RLS + storage.objects RLS on pending + admin-client-only writes to approved) so a single layer breach doesn't expose un-moderated content. The s3a.3 RLS for `trips_select` makes `unlisted` purely a knowing-the-id gate (UUIDv4 = 122 bits of entropy) — sufficient for a "share-by-link" affordance without a join table to back it. The `profiles_select_discoverable_or_self` policy was extended (drop + recreate in the new migration) instead of editing the historical migration — preserves Supabase's migration-hash invariant.
- **PM:** Three chunks shipped end-to-end against AC. Honest deferrals: trip create/update/leave Server Actions + detail page (filed as `tripplanner-718`, discovered-from `s3a.3`); rejected/orphaned pending-bucket cleanup job (filed as `tripplanner-u4c`, discovered-from `s3a.4`); CSAM scan (already filed as `tripplanner-s3a.5`); moderator queue UI (already filed as `tripplanner-s3a.6`); avatar upload UI (already filed as `tripplanner-s3a.21`); auto-classification (already filed as `tripplanner-45u`). Both follow-ups carry `--discovered-from` linkage to the parent chunk for provenance.
- **UI/UX:** Home-page "Your trips" section uses the same warm Fraunces-display + Inter-body system as the existing "People you can follow" section. Additive only; no layout regressions on the existing surface. The ToS checkbox copy on the handle form names the actual artifacts ("Terms", "Community Guidelines", "Privacy") with real links rather than a generic "I agree to the terms" — gives the user a real choice. Error message on a failed gate is warm ("Please accept the Terms..."), not legalistic. **Brand voice:** "Jettison" only as a proper noun; no emojis; no exclamation marks.
- **Code review:** All three lib modules `import "server-only"`. PG error codes mapped to enum result codes in every public helper; no raw `error.message` leaked across the trust boundary. `lib/images.ts` rolls back the bucket object on row-insert failure, so the substrate doesn't leak bytes during normal operation. `markImageRejected` retains the pending object intentionally for the audit window; `markImageApproved` logs but does not fail when the post-copy remove fails — both paths assume the cleanup job filed as `tripplanner-u4c`. `getClient` workaround in `lib/trips.ts` was removed entirely; the helpers now call `await createClient()` directly. Idempotent shapes preserved (`hasAcceptedCurrentTos` returns boolean rather than throwing on no-row).

### Out of scope (explicit deferrals)

- Trip create/update/leave Server Actions + detail page — [`tripplanner-718`](#) (new, discovered-from `s3a.3`).
- Rejected/orphaned pending-bucket cleanup job — [`tripplanner-u4c`](#) (new, discovered-from `s3a.4`).
- CSAM scan integration (reintroduces `pending_media` state) — [`tripplanner-s3a.5`](#) (existing).
- Manual moderator queue UI — [`tripplanner-s3a.6`](#) (existing).
- Avatar upload UI + `profiles.avatar_image_id` FK — [`tripplanner-s3a.21`](#) (existing).
- AI auto-classification on uploaded images — [`tripplanner-45u`](#) (existing).
- Trip Posts (text + photos) — [`tripplanner-s3a.7`](#) (existing).

### Lessons surfaced

A new lesson appended to [`tasks/lessons.md`](lessons.md): _2026-04-20 — Three more parallel chunks: shared mutable file pre-allocation, storage.objects ownership constraints, and `supabase gen types` stderr leak._ Captures the rate-limit pre-allocation pattern (parent agent pre-edits the shared file in a prep commit so subagents don't have to coordinate writes), the `comment on policy ... on storage.objects` permission constraint (migration role lacks ownership over storage.objects), and the supabase CLI tendency to leak stderr lines into stdout when piped with `>` (must hand-trim "Initialising login role..." and the CLI update notice from the regenerated `database.types.ts`).
