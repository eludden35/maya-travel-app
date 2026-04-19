---
name: blocks + mutes primitives (s3a.16)
overview: "Ship blocks + mutes primitives (`tripplanner-s3a.16`). Closes the `TODO(s3a.16)` seam left in `follows_insert_self` by `s3a.2`. Substrate + minimal Block link on the home-page discover cards (smallest end-to-end UI slice per the s3a.2 lesson). Mute is shipped as substrate only — no UI yet, no feed surface to use it on."
todos:
  - id: migration
    content: "Write supabase/migrations/20260419050000_blocks_mutes.sql: blocks + mutes tables (composite PKs, self-block / self-mute CHECKs, FKs to profiles ON DELETE CASCADE) + RLS (own-rows-only on each) + drop-and-recreate follows_insert_self with the block branch + AFTER INSERT trigger on blocks that deletes any in-flight follow edge in either direction + threat-model header comment."
    status: pending
  - id: data-layer
    content: "lib/blocks.ts (server-only): blockProfile / unblockProfile / muteProfile / unmuteProfile (idempotent) / isBlockingOrBlocked(viewerId, otherId) / getBlockedProfileIds(viewerId). PG error-code mapping (23505 -> already_set, 23514 -> cannot_self, 23503 -> profile_not_found). Wrappers in app/_actions/blocks-actions.ts (revalidatePath('/'))."
    status: pending
  - id: ui
    content: "app/_components/block-link.tsx ('use client'): tiny pill-link 'Block' (default) / 'Blocked' (active) under each discover card; confirm dialog (window.confirm at MVP) before block; surfaces error inline. app/page.tsx: in each discover-card <li>, render <BlockLink /> below <FollowButton />. Respect blocked filter: extend listDiscoverableProfilesExcluding via a new helper or filter blocked rows in app/page.tsx using getBlockedProfileIds."
    status: pending
  - id: verify
    content: "pnpm tsc --noEmit; pnpm lint; ReadLints; boundary rg for SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY/sb_secret_ in app/ lib/ proxy.ts; rg 'TODO(s3a.16)' supabase/migrations/ should now return zero matches (seam closed). Money-privacy rg: 'blocks|mutes' in supabase/migrations/ matches only this migration. Report draft commit message + list of changed files."
    status: pending
isProject: false
---

# s3a.16 — block + mute primitives

**Active Bead:** [`tripplanner-s3a.16`](#) — _infra: block + mute primitives_, P1, parent `tripplanner-s3a`. No declared blockers.

**Bead AC (verbatim):** _blocks + mutes tables + RLS in same migrations. Block enforced in DM insert policy and in feed/explore/profile read policies. Mute enforced in feed/explore read policies only (does not change writability). Symmetric block UI shows mutual invisibility immediately._

**Bead notes (verbatim, from s3a.2 close):** _When this Bead lands, its migration MUST extend the public.follows insert policy (`follows_insert_self`) with a block check in either direction... Should also revoke any in-flight follow edge between the two parties when a block is created..._

## Decisions made up-front

- **Substrate + minimal Block link on the discover cards.** Per the s3a.2 lesson ("Pure-substrate chunks ship dead code"), don't ship just tables. Ship a small "Block" link under each discover card on `app/page.tsx` so the table + the block-trumps-follow trigger are exercised end-to-end.
- **Mute is substrate-only this chunk.** Mute affects feed/explore reads — no feed yet (`s3a.10` blocked), no explore yet (`s3a.8`). Ship the table + RLS + helpers; UI lands when feed/explore do. Mute is intentionally invisible to the muted (no notification), so a Mute toggle on a discover card would surface the wrong affordance — defer.
- **DM insert policy + feed/explore read policies are explicit deferrals.** DMs (`s3a.13`), feed (`s3a.10`), explore (`s3a.8`) are all blocked-by other Beads. The block check in those policies lands when each policy lands; this Bead leaves a `TODO(s3a.16-consumers)` style note in the blocks-table threat-model header documenting the open consumers.
- **Symmetric block via trigger, not via app code.** When a block row is inserted, an `AFTER INSERT` trigger deletes any `follows` rows in either direction. Atomic, can't be skipped from the client.
- **Confirm dialog: `window.confirm` at MVP.** A real distinct-by-default confirm modal is a follow-up; `window.confirm` is the smallest thing that prevents accidental clicks.
- **No `is_blocked(a, b)` SQL helper.** Following the s3a.2 inline-EXISTS pattern; the TS layer (`lib/blocks.ts`) gets a helper.
- **Single commit.** No scaffolding to absorb.

## Schema (single migration)

`supabase/migrations/20260419050000_blocks_mutes.sql`:

- `blocks` table:
  - `blocker_id uuid not null references public.profiles(id) on delete cascade`
  - `blocked_id uuid not null references public.profiles(id) on delete cascade`
  - `created_at timestamptz not null default now()`
  - `primary key (blocker_id, blocked_id)`
  - `check (blocker_id <> blocked_id)`
- `mutes` table: same shape with `muter_id` / `muted_id`.
- Indexes: PKs cover `(blocker_id, ...)` / `(muter_id, ...)`. Add `blocks_blocked_id_idx (blocked_id)` for "is anyone blocking me?" scans (needed by the follows insert policy's exists-in-either-direction check).
- RLS on `blocks`:
  - `blocks_select_own` — `for select to authenticated using (auth.uid() = blocker_id)`. The blocker can see their own block list. The blocked party CANNOT see they were blocked (Instagram-style; symmetric invisibility means they just can't find the blocker, not that they get a "you were blocked" notice).
  - `blocks_insert_own` — `for insert with check (auth.uid() = blocker_id and blocker_id <> blocked_id)`.
  - `blocks_delete_own` — `for delete using (auth.uid() = blocker_id)`.
  - No UPDATE policy.
- RLS on `mutes`: identical shape with `auth.uid() = muter_id`.
- `AFTER INSERT` trigger on `blocks` that deletes:
  ```sql
  delete from public.follows
  where (follower_id = NEW.blocker_id and followee_id = NEW.blocked_id)
     or (follower_id = NEW.blocked_id and followee_id = NEW.blocker_id);
  ```
  RLS-bypass: trigger functions run with the caller's privileges by default; the follower could only delete their own edge. Mark the trigger function `security definer` and `set search_path = public` so the bidirectional delete works. Document the security justification in the function comment (the trigger only fires from a successful blocks insert, which is itself RLS-checked, so the privilege escalation is bounded).
- Drop and recreate `follows_insert_self`:
  ```sql
  drop policy "follows_insert_self" on public.follows;

  create policy "follows_insert_self"
    on public.follows
    for insert
    to authenticated
    with check (
      auth.uid() = follower_id
      and follower_id <> followee_id
      and not exists (
        select 1 from public.blocks
        where (blocker_id = auth.uid() and blocked_id = followee_id)
           or (blocker_id = followee_id and blocked_id = auth.uid())
      )
    );
  ```
  Note in the migration: this supersedes the `TODO(s3a.16)` policy from `20260419045026_follows.sql`.
- Threat-model header documents:
  1. **Read:** blocks/mutes are private to the actor (blocker / muter only).
  2. **Write:** the actor only.
  3. **What if outside?** RLS rejects.
  4. **Logs / PII:** none beyond the two profile UUIDs and a timestamp.
  5. **Open consumers (deferred):** DM insert policy (`s3a.13`), feed/explore read policies (`s3a.10` / `s3a.8`), profile read policy extension (block-aware `profiles_select_discoverable_or_self` — file as a follow-up below).

## App layer

- **`lib/blocks.ts`** (new, server-only):
  - `blockProfile(blockedId)` / `unblockProfile(blockedId)` — mirror `lib/follows.ts` shape.
  - `muteProfile(mutedId)` / `unmuteProfile(mutedId)` — same.
  - `isBlockingOrBlocked(viewerId, otherId): Promise<boolean>` — single existence check across both directions.
  - `getBlockedProfileIds(viewerId): Promise<string[]>` — used by the home-page discover query to filter out blocked profiles.
  - PG error-code map: `23505 -> already_set`, `23514 -> cannot_self`, `23503 -> profile_not_found`.
- **`app/_actions/blocks-actions.ts`** (new, `"use server"`): `blockAction` / `unblockAction` / `muteAction` / `unmuteAction` thin wrappers calling `lib/blocks.ts` then `revalidatePath("/")`.
- **`app/_components/block-link.tsx`** (new, `"use client"`):
  - Small `Block` text link under each discover card. Activates `window.confirm("Block @handle? They won't see you, you won't see them, and any follow between you will be removed.")`. On confirm, calls `blockAction`.
  - Pending state via `useTransition`. Error inline.
  - When already blocked, renders `Blocked` text with a small `Unblock` action (no confirm needed for unblock).
  - `aria-live="polite"` for status changes.
  - Tiny treatment — `text-xs text-secondary hover:text-error`. NOT a CTA.
- **`app/page.tsx`** (modify):
  - Replace the inline `listDiscoverableProfilesExcluding(profile.id, 10)` call with one that takes the blocked ids into account. Two options:
    - (A) Add a new lib helper `listDiscoverableProfilesExcludingMany(viewerId, excludedIds, limit)` and call it with `[viewerId, ...blockedIds]`. Cleaner.
    - (B) Filter in the home page after fetching. Cheap.
  - Pick (A) — extends `lib/profiles.ts` slightly. **NOTE: this is the one cross-chunk file we touch — `lib/profiles.ts`. Other parallel chunks do NOT touch it. Verify before commit.**
  - Each `<li>` in the discover list now renders `<FollowButton />` AND `<BlockLink />` (BlockLink stacks below the Follow button, on the same right-aligned column).
- **`lib/profiles.ts`** (modify): rename `listDiscoverableProfilesExcluding(viewerId, limit)` to `listDiscoverableProfilesExcluding(viewerId, limit, opts?)` with an optional `excludeIds: string[]` argument that defaults to `[]`. Update the home-page call site. Backward-compatible signature.

## Bead bookkeeping (to be done by parent agent after subagent reports)

- **Create `tripplanner-s3a.23`** — _feat: block + mute UI surfaces (profile pages, profile-page mute toggle, blocked-list management)_, P2, parent `s3a`, deps `blocked-by:tripplanner-s3a.16`. Acceptance: profile-page Block / Mute affordances; settings screen lists blocked + muted profiles with unblock / unmute; profile read policy extended with `not exists (blocks ...)` branch (so a blocked profile becomes invisible to the blocked party in `profiles_select_discoverable_or_self`).
- **Append note to `tripplanner-s3a.13`** (DMs): when DMs land, the `dm_messages` insert policy must check both directions of `blocks`.
- **Append note to `tripplanner-s3a.10`** (feed) and **`tripplanner-s3a.8`** (explore): when feed/explore land, their read policies must filter out blocks (in either direction) and mutes (one direction — muter's view).
- **Close `tripplanner-s3a.16`** with a substrate+block-link UI summary note.

## Verification

- `pnpm tsc --noEmit` clean.
- `pnpm lint` clean.
- `ReadLints` clean on every touched file.
- Boundary `rg` for secret-key tokens — only doc-comment matches.
- `rg "TODO\(s3a.16\)" supabase/migrations/` — should return zero matches (the seam is now closed).
- Money-privacy `rg "blocks|mutes" supabase/migrations/` — every match in the new migration.

## Subagent instructions

- Implement everything above EXCEPT: do NOT push the migration (`supabase db push`), do NOT regenerate types, do NOT do bead bookkeeping, do NOT git commit. The parent agent handles those at the end so multiple subagent migrations can be sequenced.
- Report back: (1) list of changed files, (2) draft commit message body using the s3a.2 commit style, (3) any blockers or surprises found mid-implementation.
