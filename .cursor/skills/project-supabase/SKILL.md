---
name: project-supabase
description: Repo-specific Supabase conventions for migrations, RLS, type generation, and env vars. Use when writing or reviewing a migration, adding or changing an RLS policy, generating database types, deciding what runs server-side vs in the browser, or wiring a new Supabase feature into the app. Pairs with the workspace Supabase skill (deep platform reference) and the supabase-security.mdc rule.
---

# Project Supabase conventions

This is the **repo-specific** layer. For deep platform patterns (auth flows, SSR cookies, edge functions) load the **workspace Supabase skill** first.

## Env vars

Use these names in code; the values land in `.env.local` (gitignored) and the deploy environment. Naming follows Supabase's new API-key system (`sb_publishable_*` / `sb_secret_*`); the legacy JWT keys (`anon`, `service_role`) still work and are listed for repos that haven't migrated.

| Var | Value shape | Where it lives | Allowed in browser? |
|-----|-------------|----------------|---------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | Server **and** client | Yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` _(new)_ | `sb_publishable_...` | Server **and** client | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` _(legacy)_ | JWT (`eyJ...`) | Server **and** client | Yes |
| `SUPABASE_SECRET_KEY` _(new)_ | `sb_secret_...` | **Server only** (route handlers, server actions, edge functions) | **No — never** |
| `SUPABASE_SERVICE_ROLE_KEY` _(legacy)_ | JWT (`eyJ...`) | **Server only** | **No — never** |
| `SUPABASE_JWT_SECRET` (if needed) | JWT secret | Server only | No |

Pick **one naming per project** and stick with it; mixing both invites confusion. Jettison uses the new naming (`PUBLISHABLE_KEY` / `SECRET_KEY`) — see [`.env.local.example`](../../.env.local.example).

Replace `NEXT_PUBLIC_*` with the framework's public-prefix when not on Next; the **trust boundary stays the same**: publishable key in browser, secret key server-only. **A `sb_secret_*` value behind a `NEXT_PUBLIC_*` name is a leaked credential** — Next.js inlines `NEXT_PUBLIC_*` into the browser bundle. Rotate the key in Supabase and fix the env name.

## Local + linked workflow

Development runs against the **local stack** (Docker). The hosted project `siaygwtwgvgjoircgpoa` is the **UAT** environment; CI applies migrations to it on every push to `main` (`.github/workflows/ci.yml`, job `migrate-uat`). Don't push migrations to it from a laptop.

```bash
supabase start                       # local stack; Mailpit inbox at http://127.0.0.1:54324
supabase status -o env               # values for .env.development.local
supabase db reset                    # re-apply every migration + supabase/seed.sql
supabase test db                     # pgTAP suite in supabase/tests/database/
supabase gen types typescript --local > database.types.ts 2>/dev/null
```

Commit generated types. Reviewers should reject `any` or hand-rolled DB row types when generated types are available. Always open `database.types.ts` after regenerating: without `2>/dev/null`, CLI status lines ("Initialising login role...", the update notice) land in the file.

## Migration immutability

**Once a migration file under `supabase/migrations/` has been applied (locally or to the linked project), it is immutable.** Don't edit it — not even comments. Supabase tracks each migration by its file hash; modifying an applied migration produces a hash mismatch on the next `supabase db push`, breaking other developers' machines and CI.

When you need to "close" a `TODO(<future-bead>)` marker that a previous migration left in a policy / function / trigger, do it by adding a **new** migration that does `drop policy / create policy` (or `create or replace function`, or `drop trigger / create trigger`). The historical migration file stays untouched; the new migration's header comment records that it supersedes the older marker. The grep-able `TODO(<future-bead>)` comment in the historical file is a feature — it documents a deliberate seam, not a bug.

For parallel-chunk discipline (multiple chunks adding migrations concurrently), see the **Parallel chunks** section of [`project-orchestration`](../project-orchestration/SKILL.md).

## Gotchas

- **`storage.objects` is owned by `supabase_storage_admin`.** A migration can `create policy` / `drop policy` on it but cannot `comment on policy` (SQLSTATE 42501). Document storage policies in a SQL comment block instead. The same likely applies to `auth.*` and `realtime.*`.
- **Policies and recursion / caller RLS:** see "Policy patterns that bit us" in [`.cursor/rules/supabase-security.mdc`](../../rules/supabase-security.mdc). Use the `private.*` helpers from `20261029120000_rls_hardening.sql`.
- **`supabase test db` always needs Docker.** It runs pg_prove in a container even with `--linked` or `--db-url`. With Docker down, let CI's `database` job run the suite.
- **The linked project doesn't need the DB password** for `migration list`, `db push`, `db lint` or `gen types --linked`: after `supabase login`, the CLI creates a temporary login role ("Initialising login role...").
- **`gen types --local` isn't the committed file's generator.** `database.types.ts` comes from the hosted generator. CLI 2.67.1's local output drops the `__InternalSupabase.PostgrestVersion` block, which supabase-js reads for typing, and reformats the helper generics. After a local regen, keep the committed file and splice in only your schema's hunks (new columns and functions), as `tripplanner-718` did.

## New table → checklist

For every new user-facing table, in **the same migration**:

1. `create table` with explicit columns, types, and `not null` where appropriate.
2. `alter table … enable row level security;`.
3. Add **scoped policies** — never `using (true)` on user data in production. See `.cursor/rules/supabase-security.mdc`.
4. Add **indexes** on columns referenced by RLS predicates and common filters (`user_id`, `trip_id`, FK columns).
5. If columns hold money, store **integer minor units** (`bigint` cents) with one currency per trip — never `float`. Splits stay exact and leftover cents are assigned deterministically (UAT-1 decision, 2026-10-29).
6. Write **pgTAP tests** in `supabase/tests/database/` before calling it done.

```sql
create table expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  paid_by uuid not null references profiles(id),
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null,
  description text not null,
  created_at timestamptz not null default now()
);

alter table expenses enable row level security;

create policy "expenses_select_members" on expenses
  for select to authenticated
  using (private.is_trip_member(trip_id));

create index expenses_trip_id_idx on expenses (trip_id);
```

## Auth boundary

- Browser code uses the **publishable key** (or legacy anon key) + the user session. No secret-key / service-role calls.
- Server code (route handlers, server actions, edge functions, webhooks) is the **only** place `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`) may appear.
- For Jettison: **`@supabase/ssr`** (Next.js App Router) is the cookie / session strategy. The session-refresh interceptor is `proxy.ts` at the repo root (Next.js 16's successor to `middleware.ts`).

## RLS review pointers

- Every read path must work for an **unauthenticated** request without leaking data — explicitly test as `anon`, in pgTAP (`tests.authenticate_as_anon()`).
- Every write path must work for the right **authenticated** user **and fail** for anyone else — write a policy for both `using` (read) and `with check` (write) where relevant.
- When in doubt, look at the `project-code-review` skill's "auth + payments + PII" section.

## Where to look next

- `.cursor/rules/supabase-security.mdc` — non-negotiables (RLS, secrets, webhooks).
- `.cursor/rules/project-review-checklist-sql.mdc` — migration review gate.
- Workspace Supabase skill — platform deep-dive (SSR, realtime, storage, edge fn patterns).
