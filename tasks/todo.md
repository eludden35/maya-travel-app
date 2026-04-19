# Three parallel social-substrate chunks: blocks/mutes + legal pages + rate-limit primitive

**Active Beads — all closed in this session, in dependency order:**

- [`tripplanner-s3a.17`](#) — _infra: template ToS + Community Guidelines_, P1, parent `tripplanner-s3a`. No DB; pure docs + footer.
- [`tripplanner-s3a.16`](#) — _infra: block + mute primitives_, P1, parent `tripplanner-s3a`. Closes the `TODO(s3a.16)` seam left in [`supabase/migrations/20260419045026_follows.sql`](../supabase/migrations/20260419045026_follows.sql) at the database level (without modifying that historical file).
- [`tripplanner-s3a.14`](#) — _infra: rate limiting (Posts, Comments, Follows, DMs, join requests)_, P1, parent `tripplanner-s3a`. Ships the primitive + handle-creation wiring; full surface-by-surface wiring deferred to [`tripplanner-s3a.25`](#).

**Plans:** [`s3a17_legal_pages.plan.md`](../.cursor/plans/s3a17_legal_pages.plan.md), [`s3a16_blocks_mutes.plan.md`](../.cursor/plans/s3a16_blocks_mutes.plan.md), [`s3a14_rate_limit.plan.md`](../.cursor/plans/s3a14_rate_limit.plan.md).

## Plan

### Pre-flight

- [x] **scope-check** — Confirm zero file overlap across the three chunks; pre-allocate two non-conflicting migration timestamps (`20260419050000_blocks_mutes.sql`, `20260419050100_rate_limits.sql`); legal-pages chunk has no migration. Subagents instructed to **stop before** `supabase db push`, type regen, and commits — orchestration sequenced by parent agent.

### s3a.17 — legal pages + footer (no DB)

- [x] **pages** — Three static server components: [`app/legal/terms/page.tsx`](../app/legal/terms/page.tsx), [`app/legal/community-guidelines/page.tsx`](../app/legal/community-guidelines/page.tsx), [`app/legal/privacy/page.tsx`](../app/legal/privacy/page.tsx). All include the explicit "every uploaded image is reviewed before publication" language in both ToS and Community Guidelines (per AC + [`supabase-security.mdc`](../.cursor/rules/supabase-security.mdc) hard rule #2). Disclaimer banner: "Template documents — not lawyer-reviewed at MVP."
- [x] **footer** — [`app/_components/footer.tsx`](../app/_components/footer.tsx): three links + the kicker "Jettison · Template documents · Not lawyer-reviewed at MVP". Wired globally via [`app/layout.tsx`](../app/layout.tsx).
- [x] **smoke** — `curl /legal/terms` → 200; `curl /legal/community-guidelines` → 200; `curl /legal/privacy` → 200; `curl /` → 200 + footer markup with all three `/legal/*` links + kicker copy present.

### s3a.16 — blocks + mutes substrate

- [x] **migration** — [`supabase/migrations/20260419050000_blocks_mutes.sql`](../supabase/migrations/20260419050000_blocks_mutes.sql): `blocks` + `mutes` tables (composite PKs, self-block/mute CHECKs, FKs to `profiles`, indexes on both columns) + RLS (viewer reads/inserts/deletes own rows only — mute is viewer-private by design, no policies for the muted side) + `AFTER INSERT` trigger `blocks_revoke_follows` (security definer) deletes follow edges in either direction when a block lands + drop-and-recreate of `follows_insert_self` adding the bidirectional block check (closes `TODO(s3a.16)` at the DB level — historical `follows.sql` left untouched per migration-immutability discipline; new migration's header comment records this).
- [x] **lib** — [`lib/blocks.ts`](../lib/blocks.ts) (server-only): `blockProfile` / `unblockProfile` / `muteProfile` / `unmuteProfile` / `isBlockingOrBlocked` / `getBlockedProfileIds`. PG error codes mapped to enum result codes; idempotent operations. Local `AugmentedDatabase` workaround removed after type regeneration.
- [x] **actions** — [`app/_actions/blocks-actions.ts`](../app/_actions/blocks-actions.ts) (`"use server"`): four wrappers, all `revalidatePath("/")` on success.
- [x] **ui** — [`app/_components/block-link.tsx`](../app/_components/block-link.tsx) (`"use client"`, optimistic, `useTransition`, `window.confirm` for blocks, `aria-live`). [`lib/profiles.ts`](../lib/profiles.ts) gains `excludeIds` opt on `listDiscoverableProfilesExcluding`. [`app/page.tsx`](../app/page.tsx) fetches `getBlockedProfileIds`, passes to discover query, renders `<BlockLink />` under each `<FollowButton />`. Mute UI deferred to [`tripplanner-s3a.23`](#) — affordance only becomes visibly meaningful once feed (`s3a.10`) ships.

### s3a.14 — rate-limit primitive + handle wiring

- [x] **migration** — [`supabase/migrations/20260419050100_rate_limits.sql`](../supabase/migrations/20260419050100_rate_limits.sql): `rate_limit_counters` table (composite PK on `(profile_id, surface, window_start)`, FK to `auth.users`) + index + RLS enabled with **no policies** (server-only via the SQL function — no client-side direct read/write path) + `public.try_consume_rate_limit(profile_id, surface, max, window_seconds)` security-definer function (atomic upsert, sliding-window via fixed buckets, returns boolean). Default thresholds documented in migration comment; revisable per surface.
- [x] **helper** — [`lib/rate-limit.ts`](../lib/rate-limit.ts): `RATE_LIMITS` constants (today: `HANDLE_CREATE` cap 5/hour) + `RateLimitResult` discriminated union + `withRateLimit` higher-order helper. Local RPC type-narrowing removed after type regeneration — generated `Database.public.Functions.try_consume_rate_limit` is now the source of truth.
- [x] **wire-up** — [`app/onboarding/handle/actions.ts`](../app/onboarding/handle/actions.ts) wraps `createProfile` in `withRateLimit(RATE_LIMITS.HANDLE_CREATE, …)`. [`app/onboarding/handle/page.tsx`](../app/onboarding/handle/page.tsx) extends `errorMessageFor` with `case "rate_limited"` → "Too many tries. Take a breath and try again in a few minutes." Other writeable surfaces (Posts, Comments, Follows, DMs, join requests) deferred to [`tripplanner-s3a.25`](#) — most don't exist yet, and `follow_create` wiring would have overlapped with the s3a.16 chunk in flight.

### Orchestration (sequential, parent agent)

- [x] **parallel-implement** — Three subagents launched in one message (one per chunk) with non-overlapping file scopes and pre-allocated migration timestamps.
- [x] **revert-bad-edit** — s3a.16 subagent had modified comments inside the historical [`supabase/migrations/20260419045026_follows.sql`](../supabase/migrations/20260419045026_follows.sql) to mark its `TODO(s3a.16)` seam closed. Reverted with `git checkout HEAD --` to preserve migration immutability; updated the s3a.16 migration's header comment instead to record that the historical TODO is intentionally left in place and superseded at the DB level by the new migration's `drop policy / create policy` block.
- [x] **push-migrations** — `supabase db push --linked` applied `20260419050000_blocks_mutes.sql` then `20260419050100_rate_limits.sql` sequentially to the linked project. Both clean.
- [x] **regenerate-types** — `supabase gen types typescript --linked > database.types.ts`. Confirmed `blocks` / `mutes` / `rate_limit_counters` table types and `try_consume_rate_limit` RPC signature all present.
- [x] **cleanup-temp-types** — Removed the temporary `AugmentedDatabase` type from [`lib/blocks.ts`](../lib/blocks.ts) and the temporary RPC narrowing cast from [`lib/rate-limit.ts`](../lib/rate-limit.ts). Both now consume the regenerated `Database` types directly.
- [x] **smoke-tests** — `curl` confirmations on `/legal/*` + home-page footer (above); type-regen presence as proof of `try_consume_rate_limit` and the three new tables on the linked DB.
- [x] **bead-bookkeeping** — Created [`tripplanner-s3a.23`](#) (block UI on profile pages, blocked-by `s3a.22`), [`tripplanner-s3a.24`](#) (ToS acceptance gate at signup, blocked-by `s3a.17`), [`tripplanner-s3a.25`](#) (full rate-limit wiring, blocked-by `s3a.14`). Appended notes to [`tripplanner-s3a.13`](#) (DM rate-limit + can_dm block check), [`tripplanner-s3a.10`](#) (feed mute hide), [`tripplanner-s3a.8`](#) (comments/reactions rate-limit + mute). Closed `s3a.16` / `s3a.17` / `s3a.14` with shipped notes.
- [x] **todo-review-lessons** — this file; lesson appended below.
- [ ] **commits** — three commits, one per chunk, in dependency order: `s3a.17` (no DB) → `s3a.16` (depends on `s3a.2`) → `s3a.14` (independent of `s3a.16` schema-wise, but lands last to keep the rate-limit migration after blocks/mutes for chronological clarity).

## Review

### Evidence

- **Typecheck:** `pnpm tsc --noEmit` exit 0 after temp-type cleanup.
- **Lint:** `pnpm lint` exit 0 (no warnings).
- **DB push:** `supabase db push --linked` applied both migrations cleanly to the linked project (`siaygwtwgvgjoircgpoa`).
- **Type regen:** [`database.types.ts`](../database.types.ts) regenerated; `blocks`, `mutes`, `rate_limit_counters` tables present (lines 42 / 108 / 174); `try_consume_rate_limit` RPC present with correct argument and return types (line 201).
- **HTTP smoke:** `/legal/terms` → 200, `/legal/community-guidelines` → 200, `/legal/privacy` → 200, `/` → 200 with all three `/legal/*` links and "Template documents · Not lawyer-reviewed at MVP" kicker copy in the rendered HTML.
- **Migration immutability:** `git diff HEAD -- supabase/migrations/20260419045026_follows.sql` shows zero changes to the historical follows migration.
- **Money-privacy hard rule:** none of the three migrations touch monetary tables; `blocks` / `mutes` / `rate_limit_counters` are all social-surface only. `withRateLimit` helper is keyed by `auth.uid()`, not by any monetary identifier.

### Lenses

- **Architecture:** RLS-first across all three migrations; security-definer functions used **only** where atomicity / cross-row enforcement requires it (the `blocks_revoke_follows` trigger and `try_consume_rate_limit` function). `rate_limit_counters` has RLS enabled with no policies — the only legitimate access path is via the SQL function, which prevents both client-side counter inspection and counter manipulation. The `TODO(s3a.16)` seam from `s3a.2` was closed at the DB level via a drop-and-recreate of `follows_insert_self` in the new migration, not by editing the historical file — preserves the Supabase migration-hash invariant. `lib/` modules stay `import "server-only"`; the only `"use client"` addition is `BlockLink`.
- **PM:** All three chunks honored their core AC and honest-deferred the parts that depended on infrastructure that doesn't exist yet. Cuts: mute UI (deferred to `s3a.23`, would have been incorrect on a discover card since mute is silent by design); ToS acceptance gate (deferred to `s3a.24`, requires its own table + onboarding wiring + would have overlapped files with `s3a.14`); full rate-limit wiring (deferred to `s3a.25`, most surfaces don't exist yet). Every deferral filed as a real Bead with a `--blocked-by` linkage and a `--discovered-from` provenance line, plus mirroring notes appended to the downstream Beads (`s3a.13`, `s3a.10`, `s3a.8`) so the next agent picking up Posts / DMs / feed sees the wiring contract waiting for them. Lesson from `s3a.1` (don't pull dependent infrastructure forward) and `s3a.2` (default to the smallest end-to-end slice) both reapplied.
- **UI/UX:** Footer + legal pages use Fraunces display + Inter body per the existing type ramp; warm copy throughout — no "denied" / "blocked" / "banned" framing on the footer kicker. `BlockLink` confirmation copy is a real warm sentence ("Block @{handle}? They won't see your profile or content, and you won't see theirs."), not a generic browser confirm. `aria-live="polite"` on toggle state changes. Tap targets ≥44px. **Mute deliberately invisible** as a UI affordance in this chunk (it's a viewer-side hide; surfacing it on a discover card with no feed to hide from would be the wrong affordance). **Brand voice:** "Jettison" only as a proper noun in the footer kicker — never as a verb, in keeping with [`AGENTS.md`](../AGENTS.md). No emojis, no exclamation marks across the three chunks.
- **Code review:** PG error codes mapped to enum result codes in `lib/blocks.ts` and `lib/rate-limit.ts` — never raw `error.message` to the client. `withRateLimit<T>` is generic over the wrapped work's return type so call sites get full type safety without casts. Idempotent operations (`unblock`, `unmute`, `unfollow`) return the desired end state rather than erroring on already-absent rows. Trigger `blocks_revoke_follows` is security-definer + uses `auth.uid()`-independent SQL (operates on the inserted block row's own columns) so it survives RLS context boundary cleanly. The three legal pages are pure server components with zero client dependencies — minimal blast radius on the bundle.

### Out of scope (explicit deferrals)

- Block + mute UI on profile pages — [`tripplanner-s3a.23`](#) (new, blocked-by `s3a.22`).
- ToS checkbox + dated acceptance row at signup — [`tripplanner-s3a.24`](#) (new, blocked-by `s3a.17`).
- `withRateLimit` wiring to Posts / Comments / Follows / DMs / join requests + Retry-After headers — [`tripplanner-s3a.25`](#) (new, blocked-by `s3a.14`).
- DM-side block check (block trumps `can_dm`) — [`tripplanner-s3a.13`](#) (note appended).
- Feed-side mute hide — [`tripplanner-s3a.10`](#) (note appended).
- Comments / reactions rate-limit + mute hide — [`tripplanner-s3a.8`](#) (note appended).
- Avatar upload pipeline — still [`tripplanner-s3a.21`](#) (existing, blocked-by `s3a.4`).

### Lessons surfaced

A new lesson appended to [`tasks/lessons.md`](lessons.md): _2026-04-19 — Parallel chunks need a strict file-scope contract, pre-allocated migration timestamps, and a deferred-orchestration rule._ Captures the file-overlap pre-check, timestamp pre-allocation, the subagent-stops-before-push rule, and the migration-immutability discipline (the s3a.16 subagent's edit to the historical follows migration was the closest call of the session — it would have produced a Supabase hash mismatch on the next CI push if it had landed in a commit).
