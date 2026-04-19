# Session todo

The active execution plan for the **current chunk** of work. This file is short-lived: rewrite it per chunk; promote any long-lived items to Beads (`bd create …`). Do **not** let it grow into a parallel backlog.

> **Active Bead:** [`tripplanner-s3a.1`](#) — _feat: profiles + handles + avatars_, P1, labels `mvp,social`, parent `tripplanner-s3a`.
>
> **Goal:** Ship the public Profile entity (handle + display_name + bio + `is_moderator` + `is_discoverable`) — the first social-MVP brick under [`docs/adr/0002-social-vision-pivot.md`](../docs/adr/0002-social-vision-pivot.md). Also absorb [`tripplanner-bah`](#)'s scope (`supabase init`, type-narrow the Supabase clients with `Database`, generate + commit `database.types.ts`) into this chunk and close `bah` as superseded.
>
> **Definition of done:**
>
> 1. Migration `supabase/migrations/20260419013009_profiles.sql` applied to the linked Supabase project, with RLS policies in the same migration as the table per [`.cursor/rules/supabase-security.mdc`](../.cursor/rules/supabase-security.mdc).
> 2. `database.types.ts` regenerated against the new schema and committed; `Database` type-parameterizes every Supabase client factory under `lib/supabase/`.
> 3. `lib/profiles.ts` ships `getCurrentProfile`, `requireProfile`, `createProfile`, `updateProfile` — all server-only, all with whitelisted writable columns.
> 4. `/onboarding/handle` renders the distinctive Jettison handle picker (postcard motif), and `app/page.tsx` calls `requireProfile()` so first-time signed-in users land there.
> 5. `pnpm tsc --noEmit` and `pnpm lint` clean. Boundary check `rg "SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY" app/ lib/ proxy.ts` returns only documentation comments (no runtime usage), and zero matches inside any `"use client"` module.
> 6. Avatar scope-cut filed as a follow-up Bead with a real dep on the photo pipeline; `s3a.1` body annotated with the scope split so future readers see why avatars aren't in this commit; `bah` closed as superseded with a note pointing at this chunk's migration.
> 7. Two commits with HEREDOC bodies: `chore(supabase)` for scaffolding + types + client typing, then `feat(profiles)` for the migration + helpers + onboarding + wire-up.

---

## Plan

- [x] **Step 1 — Scaffold supabase/.** `supabase init`, `supabase link --project-ref siaygwtwgvgjoircgpoa`, generate the initial `database.types.ts`, type-narrow `lib/supabase/{server,client,middleware}.ts` with `Database`. Typecheck clean.
- [x] **Step 2 — Write the profiles migration.** [`supabase/migrations/20260419013009_profiles.sql`](../supabase/migrations/20260419013009_profiles.sql): table + indexes + RLS (select discoverable-or-self / insert-self / update-self) + `set_updated_at` trigger + `profiles_no_privilege_escalation` trigger + `is_moderator(uuid)` security-definer helper. Header comment block answers the four threat-model questions from `project-architecture/SKILL.md`.
- [x] **Step 3 — Push + regenerate types.** `supabase db push --linked` succeeded; regenerated `database.types.ts` (now 215 lines, includes `profiles` Row/Insert/Update + `is_moderator` Function).
- [x] **Step 4 — Profile helpers.** [`lib/profiles.ts`](../lib/profiles.ts) — `getCurrentProfile`, `requireProfile` (redirect on missing), `createProfile` (handle+display_name whitelist + handle regex + length + 23505/23514 → enum errors), `updateProfile` (display_name+bio+is_discoverable whitelist).
- [x] **Step 5 — Onboarding page.** [`app/onboarding/handle/page.tsx`](../app/onboarding/handle/page.tsx) (server component, redirects auth-missing → `/auth/sign-in` and profile-exists → `/`), [`app/onboarding/handle/handle-form.tsx`](../app/onboarding/handle/handle-form.tsx) (thin client shell with pending state + live `@handle` preview), [`app/onboarding/handle/actions.ts`](../app/onboarding/handle/actions.ts) (Server Action wrapper that maps result codes to `?error=` redirects). Postcard-motif copy ("Address your first postcard.", "Mail it"). Mobile-first; happy / loading / handle-taken / invalid-handle / invalid-display-name / unknown / unauthorized states all rendered.
- [x] **Step 6 — Wire the gate.** [`app/page.tsx`](../app/page.tsx) calls `requireProfile()` when a user is signed in and now greets `profile.display_name` + `@profile.handle`. Unsigned-in path unchanged.
- [x] **Step 7 — Verify.** `pnpm tsc --noEmit` clean. `pnpm lint` clean. `ReadLints` clean after fixing one Tailwind redundant-utility warning on the focus-within outline. Curl smoke-test: `GET /` → 200; `GET /onboarding/handle` (anon) → 307 → `/auth/sign-in`. Boundary `rg` clean. Schema verified by the regenerated types.
- [x] **Step 8 — Bead bookkeeping.** Filed [`tripplanner-s3a.21`](#) (avatar upload follow-up, P1, parent `s3a`, blocked-by `s3a.4`). Appended scope-split note to [`tripplanner-s3a.1`](#). Closed [`tripplanner-bah`](#) as superseded.
- [x] **Step 9 — Rewrite this file.** (This rewrite.)
- [ ] **Step 10 — Append lesson** to [`tasks/lessons.md`](lessons.md): when a Bead's title implies scope that depends on infrastructure not yet shipped, prefer "ship the substrate, file the dependent slice as a follow-up Bead" over "reconcile under pressure."
- [ ] **Step 11 — Two commits.** `chore(supabase): init supabase/, generate types, type-narrow clients` then `feat(profiles): handles, display names, bio, is_moderator, RLS (s3a.1)`. Both with HEREDOC bodies matching prior commit style.

---

## Progress

Steps 1–9 complete. Steps 10–11 in flight.

---

## Results / review

### What shipped

- **Schema & RLS** — [`supabase/migrations/20260419013009_profiles.sql`](../supabase/migrations/20260419013009_profiles.sql): `profiles` table keyed 1:1 to `auth.users` with `handle citext` (case-insensitive uniqueness, regex check `^[a-z0-9_]{3,30}$`), `display_name` (1–50 chars), `bio` (≤500 chars, nullable), `is_moderator` (default false), `is_discoverable` (default true), `created_at`, `updated_at`. Three RLS policies (select-discoverable-or-self for `authenticated, anon`; insert-self; update-self). `set_updated_at` trigger. `profiles_no_privilege_escalation` trigger blocks any `is_moderator` change made in an authenticated context (`auth.uid() is not null`) and any `id` change, full stop. `public.is_moderator(profile_id uuid)` security-definer helper shipped now (executable to `authenticated, anon`) so future RLS in `s3a.4`/`s3a.6`/`s3a.7` can call it without recursion. Header comment answers the four threat-model questions from [`.cursor/skills/project-architecture/SKILL.md`](../.cursor/skills/project-architecture/SKILL.md).
- **Client typing** — [`database.types.ts`](../database.types.ts) regenerated against the live schema; [`lib/supabase/server.ts`](../lib/supabase/server.ts), [`client.ts`](../lib/supabase/client.ts), [`middleware.ts`](../lib/supabase/middleware.ts) now `createServerClient<Database>(...)` / `createBrowserClient<Database>(...)`. End-to-end row typing through every query.
- **App layer** — [`lib/profiles.ts`](../lib/profiles.ts) (server-only via `import "server-only"`), [`app/onboarding/handle/`](../app/onboarding/handle/) (page + thin client form + Server Action), [`app/page.tsx`](../app/page.tsx) wired to `requireProfile()`. Onboarding follows the postcard motif from [`.cursor/skills/project-ui-ux/SKILL.md`](../.cursor/skills/project-ui-ux/SKILL.md) — Fraunces big-`@` preview, "Address your first postcard." headline, "Mail it" CTA in Ember.
- **Beads** — Filed [`tripplanner-s3a.21`](#) (avatar upload follow-up, blocked-by `s3a.4`). Appended scope-split note to [`tripplanner-s3a.1`](#). Closed [`tripplanner-bah`](#) as superseded.

### Evidence

- `supabase db push --linked` → "Applying migration 20260419013009_profiles.sql... Finished supabase db push."
- `pnpm tsc --noEmit` → exit 0, no output.
- `pnpm lint` → exit 0, no output. `ReadLints` → 0 errors after fixing one Tailwind `focus-within:outline outline-2` redundancy.
- `database.types.ts` now contains `profiles.{Row,Insert,Update}` with all six writable columns + `created_at` + `updated_at`, and `Functions.is_moderator: { Args: { profile_id: string }; Returns: boolean }`.
- `curl -sI http://localhost:3000/onboarding/handle` → `307` redirect to `/auth/sign-in` for anon user (the auth-missing branch fires before the profile-exists branch). `GET /` → 200.
- `rg "SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY"` against `app/`, `lib/`, `proxy.ts` → only doc-comment matches in [`lib/supabase/server.ts`](../lib/supabase/server.ts) and [`app/auth/sign-in/page.tsx`](../app/auth/sign-in/page.tsx). Zero runtime usage; zero hits inside any `"use client"` module.

### Lenses applied

- **Architecture** — RLS-first migration with the table + three policies + two triggers + the security-definer helper all in one file. The `is_moderator()` helper ships now (rather than in `s3a.6`) because future RLS will reference it and shipping it once-and-correctly is cheaper than retrofitting. The privilege-escalation trigger uses `auth.uid() is not null` so the Supabase dashboard's service-role calls (which run with `auth.uid()` null) can still grant `is_moderator = true` manually — the only intended grant path at MVP. The `is_discoverable = false` branch of the select policy intentionally collapses to "self only" until [`tripplanner-s3a.2`](#) (`follows`) and `trip_members` exist; the migration header documents this so the next agent expands the policy in those Beads' migrations rather than copy-pasting.
- **PM** — Avatars cut from this chunk and filed as [`tripplanner-s3a.21`](#) (P1, blocked-by `s3a.4`) rather than reconciled under pressure. The Bead title said "profiles + handles + avatars" but the AC required avatars to use the images-pending bucket which doesn't exist yet — pulling [`tripplanner-s3a.4`](#) forward would have tripled chunk size and required a manual-SQL approval shim that violates the spirit of the hard rule. `bah` closed as superseded rather than left dangling, per its own note. Two commits keep the scaffolding (close-bah-worthy) and the feature work (close-s3a.1-worthy after manual sign-in verification) cleanly separable.
- **UI/UX** — Onboarding page reads as content-mode, not money-mode (per `project-ui-ux` "Money mode vs content mode"): the protagonist is the handle (an identity / postcard front), oversized in Fraunces with a small mono "@" prefix that mirrors the input live as the user types. Copy is Jettison-distinctive ("Address your first postcard.", "Mail it" instead of "Save" or "Continue") and avoids the verb "jettison" in transactional flow per [`AGENTS.md`](../AGENTS.md). All states designed: happy (form ready), loading (button → "Mailing it...", inputs disabled), `handle_taken` / `invalid_handle` (inline `aria-describedby` error on the field), `invalid_display_name` (same on display_name field), `unauthorized` / `unknown` (top-level `role="alert"`). Mobile-first: `max-w-sm`, 12-row tap targets, `inputMode`, `autoComplete`, `enterKeyHint` set on every field. Focus rings preserved; reduced-motion already handled globally.
- **Code review** — Every Supabase query now goes through a `Database`-typed client (no `any`). Server-only modules guarded with `import "server-only"` so they cannot be transitively imported from a `"use client"` module. Server Actions whitelist writable columns explicitly; the DB trigger is defense-in-depth. Error handling distinguishes expected (`23505 → handle_taken`, `23514 → invalid_handle`) from unexpected (`unknown` + console.error without leaking the user id). Boundary `rg` clean. The `supabase-security.mdc` "money privacy" rule is trivially satisfied — no money tables touched. Two commits with HEREDOC bodies match the existing `5b58ead` scaffold-style.

### Follow-ups (already filed as Beads)

- **[`tripplanner-s3a.21`](#)** — _feat: avatar upload UI + profiles.avatar_image_id FK_, P1, parent `s3a`, blocked-by [`tripplanner-s3a.4`](#). Soft note about waiting for [`tripplanner-s3a.6`](#) (moderator queue UI) so the human-approval gate the hard rule requires actually exists before avatars are visible to anyone.
- **[`tripplanner-s3a.1`](#)** — annotated with the scope-split note; close after the user runs the manual sign-in roundtrip and confirms onboarding works end-to-end against the real Supabase project.
- **[`tripplanner-bah`](#)** — closed as superseded.

### Lessons

Appended to [`tasks/lessons.md`](lessons.md): _When a Bead's title implies scope that depends on infrastructure not yet shipped, ship the substrate and file the dependent slice as a follow-up Bead — don't reconcile under pressure inside the wrong chunk._
