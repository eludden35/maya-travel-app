---
name: project-supabase
description: Repo-specific Supabase conventions for migrations, RLS, type generation, and env vars. Use when writing or reviewing a migration, adding or changing an RLS policy, generating database types, deciding what runs server-side vs in the browser, or wiring a new Supabase feature into the app. Pairs with the workspace Supabase skill (deep platform reference) and the supabase-security.mdc rule.
---

# Project Supabase conventions

This is the **repo-specific** layer. For deep platform patterns (auth flows, SSR cookies, edge functions) load the **workspace Supabase skill** first.

## Env vars (placeholders until the project ref is created)

Use these names in code; the values land in `.env.local` (gitignored) and the deploy environment.

| Var | Where it lives | Allowed in browser? |
|-----|----------------|---------------------|
| `NEXT_PUBLIC_SUPABASE_URL` (or framework-equivalent public url) | Server **and** client | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or framework-equivalent public anon key) | Server **and** client | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** (route handlers, server actions, edge functions) | **No — never** |
| `SUPABASE_JWT_SECRET` (if needed) | Server only | No |

Replace `NEXT_PUBLIC_*` with the framework's public-prefix when not on Next; the **trust boundary stays the same**: anon key in browser, service role server-only.

## Local + linked workflow

```bash
supabase login                       # one-time
supabase link --project-ref <ref>    # one-time per repo
supabase db pull                     # bring remote schema down as a baseline migration (first time only)
supabase db push                     # apply local migrations to the linked project
supabase gen types typescript --linked > types/supabase.ts
```

Commit generated types. Reviewers should reject `any` or hand-rolled DB row types when generated types are available.

## New table → checklist

For every new user-facing table, in **the same migration**:

1. `create table` with explicit columns, types, and `not null` where appropriate.
2. `alter table … enable row level security;`.
3. Add **scoped policies** — never `using (true)` on user data in production. See `.cursor/rules/supabase-security.mdc`.
4. Add **indexes** on columns referenced by RLS predicates and common filters (`user_id`, `trip_id`, FK columns).
5. If columns hold money, use **`numeric`** with explicit precision/scale — never `float`.

```sql
create table expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  payer_id uuid not null references auth.users(id),
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null,
  description text not null,
  created_at timestamptz not null default now()
);

alter table expenses enable row level security;

create policy "expenses_select_members" on expenses
  for select to authenticated
  using (exists (
    select 1 from trip_members m
    where m.trip_id = expenses.trip_id
      and m.user_id = auth.uid()
  ));

create index expenses_trip_id_idx on expenses (trip_id);
```

## Auth boundary

- Browser code uses the **anon key** + the user session. No service-role calls.
- Server code (route handlers, server actions, edge functions, webhooks) is the **only** place `SUPABASE_SERVICE_ROLE_KEY` may appear.
- Once the framework is chosen, **pin the cookie / session strategy** here (e.g. `@supabase/ssr` for Next App Router, `supabase-js` browser-only for Vite SPA).

## RLS review pointers

- Every read path must work for an **unauthenticated** request without leaking data — explicitly test as `anon`.
- Every write path must work for the right **authenticated** user **and fail** for anyone else — write a policy for both `using` (read) and `with check` (write) where relevant.
- When in doubt, look at the `project-code-review` skill's "auth + payments + PII" section.

## Where to look next

- `.cursor/rules/supabase-security.mdc` — non-negotiables (RLS, secrets, webhooks).
- `.cursor/rules/project-review-checklist-sql.mdc` — migration review gate.
- Workspace Supabase skill — platform deep-dive (SSR, realtime, storage, edge fn patterns).
