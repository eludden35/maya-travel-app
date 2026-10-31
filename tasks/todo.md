# UAT readiness: stabilize, secure, and stand up UAT-1

**Session:** 2026-10-29. **Epic:** [`tripplanner-2o5`](#) — _UAT-1: core trip loop (invite-only friends & family, manual settle)_. **Test plan:** [`docs/uat/uat-1-test-plan.md`](../docs/uat/uat-1-test-plan.md).

A full review of the app (no code had changed since 2026-04-20) found that it wasn't ready for UAT. This session did Phase 0 (stabilize and secure) and Phase 1 (UAT environment and quality gates). Phase 2 (build the UAT-1 scope) and Phase 3 (run UAT) are filed as Beads under the epic.

## Decisions (founder, 2026-10-29)

- **UAT-1 scope: the core trip loop.** Create a trip, invite by link, shared costs, balances, mark as paid, text posts. Photos, DMs, explore, notifications and real payments wait for later rounds.
- **Testers:** 5–25 invited friends and family. Invite-only: onboarding completes only for an email in `private.onboarding_allowlist`.
- **Money:** tracked and settled manually; no payment provider. Integer minor units, one currency per trip, member-only RLS, RPC-only writes.
- **Environments:** the hosted Supabase project `jettison` (`siaygwtwgvgjoircgpoa`, test data only) is **UAT**. Development runs on local Supabase in Docker. Production gets a new project at launch.
- **Defaults:** hidden profiles are visible only to the person, trip co-members and people they follow; posts and money are members-only; no guest participants in UAT-1.

## Review findings

| # | Sev | Finding | Fixed by |
|---|---|---|---|
| 1 | P0 | `trip_members` read policy queried itself → 42P17 on every signed-in read of `profiles`, `trips`, `trip_members`; helpers hid it, users looped through onboarding | `private.is_trip_member` |
| 2 | P0 | Any account could insert its own profile with `is_moderator = true` (guard trigger was UPDATE-only, grants wide open) | INSERT revoked; trigger on insert or update; `complete_onboarding` |
| 3 | P1 | Unlisted trips listable with `?visibility=eq.unlisted` | Unlisted branch dropped; `get_trip(id)` |
| 4 | P1 | Blocks one-way: the blocked user could re-follow and still see the blocker | `has_blocked_me`, `blocked_either_way` in policies |
| 5 | P1 | Rate-limit RPC trusted caller-supplied identity and limits; callable by anon | `consume_rate_limit(surface)`, limits in `private.rate_limit_rules` |
| 6 | P1 | Clients could upload to `images-pending` and insert `pending_review` rows directly; no bucket limits; anon could list approved | Storage policies dropped; admin-client inserts; size/type limits; path check |
| 7 | P1 | Private trips uncreatable (INSERT … RETURNING had no organizer branch); organizers could add anyone | Organizer branch; AFTER INSERT membership trigger; forced-add policy dropped |
| 8 | P1 | Profile + ToS acceptance were two calls; direct API insert skipped the gate | `complete_onboarding` (one transaction) |
| 9 | P2 | Open redirect via `next=//…`, raw auth error text, Origin-derived `emailRedirectTo` | `safeNextPath`, error codes, `SITE_URL` |
| 10 | P2 | Smaller gaps (`search_path`, `created_at` spoofing, `is_moderator()` answered for anyone, …) | Same migration |
| 11 | P2 | Contrast below AA (`muted` ≈ 2.6:1, ember ≈ 4.4:1) | Open: `tripplanner-2o5.11` |

## Plan

### Phase 0 — stabilize and secure

- [x] Toolchain: Node 24 (`.nvmrc`), pnpm 11.25 (`packageManager`), `engines`; `pnpm install`; typecheck and lint re-baselined.
- [x] pgTAP suite in [`supabase/tests/database/`](../supabase/tests/database/) (`000-setup.sql` + nine files covering findings 1–8) and a local-only [`supabase/seed.sql`](../supabase/seed.sql).
- [x] Corrective migrations: [`20261029120000_rls_hardening.sql`](../supabase/migrations/20261029120000_rls_hardening.sql) (findings 1–8 and 10) and [`20261029120100_onboarding_allowlist.sql`](../supabase/migrations/20261029120100_onboarding_allowlist.sql) (invite-only).
- [x] TypeScript to match: RPC-based onboarding, ToS, rate limits and `get_trip`; read helpers throw `DataAccessError` instead of returning null or `[]`; image rows inserted by the admin client; follow returns `unavailable` when blocked; `isUuid` guards on actions.
- [x] Auth: 6-digit code plus a `token_hash` link through [`/auth/confirm`](../app/auth/confirm/route.ts), which works across devices; `SITE_URL`-based redirects; `safeNextPath`; error codes instead of raw text; error, global-error and not-found pages.
- [x] Pushed both migrations to UAT with `supabase db push --linked`. This one push was from a laptop, with the founder's go-ahead, because CI can't migrate UAT until its secrets exist.
- [x] Regenerated [`database.types.ts`](../database.types.ts) from UAT.
- [ ] **Run the pgTAP suite.** Blocked locally: the Docker engine is down, and `supabase test db` needs Docker even with `--linked`, because it runs pg_prove in a container. Run it in CI or with psql.
- [ ] **Incident check on UAT** (SQL editor): `select id, handle, created_at from public.profiles where is_moderator;` should list only accounts you made moderators. Finding 2 was open from 2026-04-19.

### Phase 1 — UAT environment and quality gates

- [x] CI in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) has four jobs:
  - `app`: typecheck, lint, Vitest, secret boundary.
  - `database`: pgTAP on a fresh local stack.
  - `e2e`: Playwright and Mailpit.
  - `migrate-uat`: runs on `main` only, and only once its secrets exist.
- [x] Sentry (`@sentry/nextjs`): off unless `NEXT_PUBLIC_SENTRY_DSN` is set; no PII.
- [x] Security headers and CSP; `noindex` and `robots.txt` unless `ALLOW_INDEXING=true`.
- [x] PWA manifest and JTSN icons; scaffold SVGs and favicon removed.
- [x] Vitest unit tests (32): `safeNextPath`, `maskIp` / `truncateUserAgent`, `isUuid`.
- [x] [`scripts/check-client-secrets.mjs`](../scripts/check-client-secrets.mjs) replaces the broken `rg` gate.
- [ ] Founder steps: Supabase Pro for the UAT window; Vercel project and env vars; custom SMTP with SPF, DKIM and DMARC; Site URL and redirect allow-list; the code-and-link email template; GitHub secrets; allow-list entries.

### Phases 2 and 3

- [x] Filed as Beads by a side session:
  - 13 children under `tripplanner-2o5`.
  - Post-UAT items: `1s0`, `311`, `ewo`, `iha`, `qer`, `sa4`, `ymv`.
  - Doc cleanup `2er` (stale s3a.26 and s3a.27 citations).
- [x] UAT-1 test plan written by a side session: 8 scenarios, a privacy sweep, entry and exit criteria, and 6 open questions for the Phase 2 chunk plans.

## Review

### Evidence

- `supabase migration list --linked`: the remote matched local through `20260419190200`. `supabase db push --linked` then applied `20261029120000` and `20261029120100` cleanly.
- `supabase db lint --linked --schema public,private --level warning`: "No schema errors found".
- Anonymous probes against the UAT REST API, using the publishable key only:

| Probe | Result |
|---|---|
| `GET /rest/v1/trips?visibility=eq.unlisted` | 200 `[]` |
| `GET /rest/v1/profiles?select=id&limit=1` | 200, one row (no 42P17) |
| `GET /rest/v1/trip_members` | 200 `[]` |
| `POST /rest/v1/rpc/get_trip` (unknown id) | 200 `[]` |
| `POST /rest/v1/rpc/is_moderator` (someone else) | 200 `false` |
| `POST /rest/v1/rpc/{consume_rate_limit,complete_onboarding,can_complete_onboarding,accept_tos}` | 401, 42501 permission denied |
| `POST /rest/v1/rpc/try_consume_rate_limit` | 404 PGRST202 (dropped) |
| `POST /rest/v1/{profiles,images,tos_acceptances}` | 401, 42501 permission denied |
| Storage list `images-approved`, `images-pending` | 200 `[]` |

- `pnpm typecheck` exit 0; `pnpm lint` exit 0; `pnpm test` 32/32 passed; `pnpm check:secrets` OK.
- `pnpm build`: exit 0 (16 routes).
- `pnpm start` with `curl` showed:
  - Headers: CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy and `X-Robots-Tag: noindex, nofollow` are present; `X-Powered-By` is absent.
  - `/auth/callback?next=//evil.example` → `/auth/sign-in?error=missing_code`.
  - A bogus `/auth/confirm` link → `?error=link_invalid`.
  - Signed-out `/onboarding/handle` → `/auth/sign-in`.
  - `robots.txt` is `Disallow: /`; the manifest and icons are served.
- **Not yet run:**
  - pgTAP (`supabase test db`).
  - Playwright smoke (`pnpm test:e2e`).
  - Signed-in smoke on UAT.
  - The incident check.

### Lenses

- **Architecture.** Identity-dependent checks live in `private` SECURITY DEFINER helpers with `search_path = ''`, and take identity only from `auth.uid()`. The `private` schema isn't exposed over the API. Writes that must be atomic, or whose limits clients must not choose, go through RPCs that revoke `public` and `anon` explicitly.
- **PM.** UAT-1 is a deliberate subset of the MVP: the trip loop, money and text posts. Photos wait on the moderation queue and CSAM gates. Open questions on edit rights, leftover cents, settlement rights and invite defaults are listed in the test plan, so each Phase 2 chunk answers them.
- **UI/UX.**
  - Sign-in now works when the link opens on a different device or in an in-app browser, and the code step masks the email.
  - The invite-only screen offers "Use a different email".
  - The contrast fixes are still open (`2o5.11`).
- **Code review.**
  - No raw database or auth error text reaches the UI.
  - Read helpers throw, so an outage looks like an error rather than "nothing here".
  - `pnpm check:secrets` guards the client boundary in CI.
