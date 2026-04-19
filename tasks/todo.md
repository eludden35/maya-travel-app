# Asymmetric follow graph + home-page discover section

**Active Bead:** [`tripplanner-s3a.2`](#) — _feat: follow graph (asymmetric)_, P1, parent `tripplanner-s3a`, blocked-by `s3a.1`. Closed in this chunk.

**Plan:** [`.cursor/plans/follows_asymmetric_graph_ea294bdc.plan.md`](../.cursor/plans/follows_asymmetric_graph_ea294bdc.plan.md).

## Plan

- [x] **migration** — `supabase/migrations/20260419045026_follows.sql`: `follows` table (composite PK, self-follow CHECK, FKs to `profiles`) + indexes (`follows_followee_id_idx`, `follows_followee_created_idx`) + RLS (`follows_select_all` / `follows_insert_self` / `follows_delete_self`) + drop-and-recreate `profiles_select_discoverable_or_self` with the follower-exists branch + threat-model header + `TODO(s3a.16)` marker.
- [x] **push-types** — `supabase db push --linked`; regenerate [`database.types.ts`](../database.types.ts); confirmed `follows.{Row,Insert,Update}` present, profiles columns unchanged.
- [x] **follow-helpers** — [`lib/follows.ts`](../lib/follows.ts) (server-only): `followProfile` / `unfollowProfile` (idempotent) / `isFollowing` / `getFollowCounts`; PG error codes (`23505` / `23514` / `23503`) mapped to enum result codes. [`lib/profiles.ts`](../lib/profiles.ts) gains `listDiscoverableProfilesExcluding(viewerId, limit)`.
- [x] **ui** — [`app/_components/follow-button.tsx`](../app/_components/follow-button.tsx) (`"use client"`, optimistic toggle, `useTransition`, aria-live, `Follow` / `Following` → hover `Unfollow`). [`app/_actions/follows-actions.ts`](../app/_actions/follows-actions.ts) (`"use server"`, calls `lib/follows.ts` + `revalidatePath("/")`). [`app/page.tsx`](../app/page.tsx) renders counts inline (`font-mono tabular-nums`) and a `People to follow` section listing up to 10 other discoverable profiles each with a `<FollowButton />` plus an empty state.
- [x] **verify** — `pnpm tsc --noEmit` clean; `pnpm lint` clean; `ReadLints` clean on every touched file; boundary `rg` for `SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|sb_secret_` in `app/`/`lib/`/`proxy.ts` returns only doc-comment matches; anon `curl GET /` → 200; `curl GET /onboarding/handle` → 307; money-privacy `rg "follows" supabase/migrations/` → only the new follows migration + the s3a.1 profiles migration's deferred-branch comment, never a monetary table. **Known gap:** signed-in two-tab follow/unfollow round-trip not run (only one test user available); deferred to `s3a.22` verification.
- [x] **bead-bookkeeping** — Filed [`tripplanner-s3a.22`](#) (_feat: profile pages at /[handle] (reuse FollowButton from s3a.2)_, P2, parent `s3a`, deps `blocked-by:tripplanner-s3a.2`). Appended note to [`tripplanner-s3a.16`](#) detailing the policy extension when blocks ship. Appended substrate+UI summary note to [`tripplanner-s3a.2`](#) and closed it.
- [x] **todo-review-lessons** — this file; lessons file unchanged (the seam-finding lesson from `s3a.1` already covers the deferral pattern used here).
- [x] **commit** — single commit `feat(follows): asymmetric follow graph + home-page discover section (s3a.2)` with HEREDOC body matching the s3a.1 commit style.

## Review

### Evidence

- **Typecheck:** `pnpm tsc --noEmit` exit 0.
- **Lint:** `pnpm lint` exit 0.
- **ReadLints:** clean on `lib/follows.ts`, `lib/profiles.ts`, `app/_actions/follows-actions.ts`, `app/_components/follow-button.tsx`, `app/page.tsx`.
- **DB push:** migration `20260419045026_follows.sql` applied to linked project; type generation reflects the new `follows` table.
- **Boundary `rg`:** secret-key / service-role tokens appear only in pre-existing doc comments (`lib/supabase/server.ts`, `app/auth/sign-in/page.tsx` doc comment); zero `"use client"` files reference them.
- **Anon smoke:** `curl http://localhost:3000/` → 200, `/onboarding/handle` → 307. Pages compile cleanly with the new code paths reachable from the signed-in branch.
- **Money-privacy hard rule:** `rg "follows" supabase/migrations/` matches only `20260419045026_follows.sql` and the deferred-branch comment in `20260419013009_profiles.sql` — no monetary table touched.

### Lenses

- **Architecture:** RLS-first, composite PK keeps the table minimal, deferred block check is honest-deferred via a grep-able `TODO(s3a.16)` marker plus a mirroring note on `s3a.16`. Profiles policy extension drops-and-recreates in the same migration so the substrate-and-its-consumer evolve together. Client/server boundary stays explicit: `lib/` is `import "server-only"`, `app/_actions/` is `"use server"`, exactly one `"use client"` component (`FollowButton`).
- **PM:** scope grew from substrate-only to substrate-plus-minimal-UI deliberately — the home-page discover section is the smallest end-to-end slice that exercises every server action and lets a real user feel the feature. Profile pages stay deferred to `s3a.22` (meatier piece). Block check stays deferred to `s3a.16` with a tracked seam. AC honored except the block branch, which is honest-deferred — not silently dropped.
- **UI/UX:** mobile-first single-column discover list with rounded `bg-card` rows; `<FollowButton />` is pill-shaped with a quiet `bg-card border-hairline` for the "Following" state and `bg-ember` for the unfollowed state; tap target ≥44px (`h-11`); `aria-live="polite"` announces toggle state changes; empty state is real warm copy ("No one else is here yet — share Jettison with a friend who plans trips.") rather than a skeleton; counts use `font-mono tabular-nums` consistent with the existing money-numerals motif so the section reads as part of the Jettison visual language. **Microcopy never uses the verb "jettison"** in transactional surfaces (per `AGENTS.md`).
- **Code review:** every Supabase query runs against the `Database`-typed client (no `any`); PG error codes map to enum result codes (no raw error reflection to the client); idempotent unfollow returns the desired end state; `import "server-only"` keeps both `lib/` modules out of client bundles; `FollowButton` props are a typed interface (no raw Profile rows widening the public surface); `already_following` after an optimistic `Follow` is treated as success in the UI.

### Out of scope (explicit deferrals)

- Profile pages at `/[handle]` — `tripplanner-s3a.22` (new follow-up, blocked-by this Bead).
- Block check on follow inserts — `tripplanner-s3a.16` (existing).
- Co-trip-members branch on `profiles_select_discoverable_or_self` — lands when `trip_members` ships.
- Followee-removes-follower path — discovered-from follow-up if needed.
- Pagination on the discover list — capped at 10 for MVP.
- Dedicated `/explore` route — `tripplanner-s3a.8`.
- Followers feed — `tripplanner-s3a.10`.
- Notifications on new follower — `tripplanner-s3a.9`.
- Rate limiting on follows — `tripplanner-s3a.14`.
- DM gating using `can_dm` — `tripplanner-s3a.13`.
