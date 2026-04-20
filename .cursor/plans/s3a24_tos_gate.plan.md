---
name: ToS acceptance gate at signup (s3a.24)
overview: "Add the `tos_acceptances` table + RLS, a server-only `lib/legal.ts` constants module + `lib/tos.ts` data-layer helpers, a `TOS_ACCEPT` entry in `RATE_LIMITS`, and a single required checkbox above the submit button on `/onboarding/handle` whose label inlines the three `/legal/*` links. The `submitHandleAction` server action gates the existing `createProfile` call on a fresh acceptance row for the current `CURRENT_TOS_VERSION`. Closes the deferred AC line from `tripplanner-s3a.17` and the AC of `tripplanner-s3a.24`. In-app re-acceptance UX for an existing user when the version constant bumps is honest-deferred to a new follow-up Bead `tripplanner-s3a.27`."
todos:
  - id: migration
    content: "Write supabase/migrations/20260419190200_tos_acceptances.sql: tos_acceptances table (id uuid PK, profile_id uuid FK to auth.users on delete cascade, version text not null, accepted_at timestamptz default now(), nullable masked ip text, nullable truncated user_agent text, composite UNIQUE (profile_id, version), index on profile_id) + RLS enabled with select-own / select-moderator / insert-own policies (no update, no delete). Header threat-model comment cites s3a.17 deferred AC line, ADR 0002 Phase 2 framing, the deliberate absence of update/delete policies, and the IP/UA masking choice."
    status: pending
  - id: legal-constants
    content: "Create lib/legal.ts (server-only): export const CURRENT_TOS_VERSION = 'v1.0-2026-04-19'; export type TosVersion = string. JSDoc explains this is the single source of truth the gate checks against - bumping it forces re-acceptance via lib/tos.ts."
    status: pending
  - id: tos-helper
    content: "Create lib/tos.ts (server-only): acceptCurrentTos({ ip?, userAgent? }) using the per-request server client (auth.uid() resolved server-side, ON CONFLICT DO NOTHING for idempotency, returns AcceptResult discriminated union); hasAcceptedCurrentTos(profileId) returning boolean via select-then-shape; getCurrentTosVersion() returning the constant from lib/legal.ts. Header doc explains the data-layer/constants split between lib/tos.ts and lib/legal.ts."
    status: pending
  - id: rate-limit-entry
    content: "Modify lib/rate-limit.ts (additive only): add TOS_ACCEPT: { surface: 'tos_accept', max: 10, windowSeconds: 60 * 60 } to the RATE_LIMITS const. Inline comment explains the cap is anti-bot, not anti-user (legitimate users hit this once per onboarding plus once per version bump). DO NOT modify withRateLimit, RateLimitResult, or any existing entry."
    status: pending
  - id: form-checkbox
    content: "Modify app/onboarding/handle/handle-form.tsx: add a fieldset above the submit button containing a single required checkbox (name='tos_accepted', HTML5 required, 24x24 visual size, inside a single <label> so the whole row is the click target). Label text inlines three <Link> elements to /legal/terms, /legal/community-guidelines, /legal/privacy (no target='_blank'). Inline hint string below the label. No emoji, no exclamation marks. Mobile-first vertical stack."
    status: pending
  - id: action-gate
    content: "Modify app/onboarding/handle/actions.ts: read formData.get('tos_accepted'); if it is not the literal string 'on', redirect('/onboarding/handle?error=tos_required') before withRateLimit ever runs. After the existing HANDLE_CREATE rate-limit + createProfile success path returns, call await acceptCurrentTos(...) wrapped in withRateLimit(RATE_LIMITS.TOS_ACCEPT, ...) BEFORE the redirect('/'); on rate_limited or unknown from the TOS_ACCEPT wrapper, redirect with the existing error codes (already mapped by errorMessageFor). Order: validate checkbox -> create profile -> record acceptance -> success redirect."
    status: pending
  - id: page-error-copy
    content: "Modify app/onboarding/handle/page.tsx errorMessageFor: add case 'tos_required' returning 'Please read and accept the three documents first.' Match the warm register of the existing rate_limited / handle_taken strings. Verify errorMessageFor lives only in this one file via Grep before editing."
    status: pending
  - id: verify
    content: "pnpm tsc --noEmit; pnpm lint; ReadLints clean on every touched file. Boundary rg for SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|sb_secret_ in app/ lib/ proxy.ts returns only doc-comment matches. Money-privacy rg: tos_acceptances has zero references to any monetary table. Report back: list of changed files, the exact checkbox label copy used, draft commit message body in the s3a.14 / s3a.16 style. Subagent does NOT run supabase db push, does NOT regenerate database.types.ts, does NOT git commit."
    status: pending
isProject: false
---

# s3a.24 - ToS acceptance gate at signup

## 1. Bead context

**Active Bead:** [`tripplanner-s3a.24`](#) - _feat: ToS acceptance gate at signup (checkbox + dated acceptance row)_, P1, parent [`tripplanner-s3a`](#), discovered-from [`tripplanner-s3a.17`](#) (closed).

**Bead AC (verbatim):** _tos_acceptances table + RLS in same migration. submitHandleAction in app/onboarding/handle/actions.ts blocks createProfile until an acceptance row for the current version exists for the signed-in user. Onboarding form has a single required checkbox with all three /legal/* links inline. Re-prompts when the constant version changes. Unit-level: trying to bypass via the server action without the checkbox returns ?error=tos_required and the page renders a warm 'Please read and accept the three documents first.' message. tsc + lint clean._

**Deferred AC line this chunk closes (from s3a.17 notes):** _"Sign-up flow gates on accepting the ToS (checkbox + dated acceptance row)."_ s3a.17 explicitly honest-deferred this line because it would have overlapped files with s3a.14 in flight (both wanted `app/onboarding/handle/actions.ts`). Now that s3a.14 has shipped its rate-limit primitive and `withRateLimit` wrapper, this chunk owns the same file alone and finishes the gate.

**Phase 2 framing.** This is **template-doc acceptance**, not lawyer-reviewed acceptance - both [`docs/adr/0002-social-vision-pivot.md`](../../docs/adr/0002-social-vision-pivot.md) and the disclaimer banners on each `/legal/*` page are explicit that nothing is counsel-reviewed at MVP. Phase 2 gate criteria (5,000 MAU OR first material abuse incident) decide when lawyer-reviewed ToS replaces these templates. The data this chunk collects (`accepted_at`, `version`, masked `ip`, truncated `user_agent`) is the **minimum** record needed to demonstrate good-faith record-keeping if any abuse complaint surfaces during the pre-Phase 2 window. It is intentionally not a substitute for the Phase 2 lawyered consent record - it is the responsible bridge.

## 2. Scope IN / OUT

### IN this increment

- **Migration** [`supabase/migrations/20260419190200_tos_acceptances.sql`](#) (NEW) - `tos_acceptances` table, indexes, RLS policies, all in one file per [`project-supabase`](../../.cursor/skills/project-supabase/SKILL.md) "New table -> checklist".
- **Constants module** [`lib/legal.ts`](#) (NEW) - `CURRENT_TOS_VERSION` constant + `TosVersion` type alias. Single source of truth that the gate checks against. Bumping this constant is what forces re-acceptance.
- **Data-layer helpers** [`lib/tos.ts`](#) (NEW) - server-only `acceptCurrentTos(opts?)`, `hasAcceptedCurrentTos(profileId)`, `getCurrentTosVersion()`. Split from `lib/legal.ts` because constants/types and Supabase-touching helpers have different change rates and different review surfaces - matches the `lib/profiles.ts` / `lib/rate-limit.ts` shape already in the repo.
- **Rate-limit constant** [`lib/rate-limit.ts`](#) (MODIFY - additive only) - one new entry `TOS_ACCEPT: { surface: "tos_accept", max: 10, windowSeconds: 60 * 60 }` appended to `RATE_LIMITS`. The `withRateLimit` function and `RateLimitResult` type are NOT changed.
- **Onboarding form** [`app/onboarding/handle/handle-form.tsx`](#) (MODIFY) - add a single required checkbox with an inline three-link label, above the submit button.
- **Server action** [`app/onboarding/handle/actions.ts`](#) (MODIFY) - validate `tos_accepted === "on"` before doing anything else; on success redirect, call `acceptCurrentTos()` wrapped in `withRateLimit(RATE_LIMITS.TOS_ACCEPT, ...)` before the final `redirect("/")`.
- **Error copy** [`app/onboarding/handle/page.tsx`](#) (MODIFY) - extend `errorMessageFor` with `case "tos_required"` returning a warm sentence.

### OUT (with Bead IDs / rationale)

- **In-app re-acceptance flow when the version constant bumps.** `hasAcceptedCurrentTos(profileId)` will return `false` for any existing user whose latest acceptance row is older than `CURRENT_TOS_VERSION` - by definition. But the **UX for routing those users** (a route guard in `proxy.ts`, an interstitial page, a banner) is OUT. **File as `tripplanner-s3a.27`** (`feat: in-app re-acceptance flow on ToS version bump`, P2, parent `s3a`, blocked-by `s3a.24`, discovered-from `s3a.24`). Sketch AC: existing users with no current-version row are routed to a `/legal/accept` interstitial on next sign-in; the interstitial reuses the checkbox + label pattern from this chunk; calling `acceptCurrentTos()` records the new version row; on success the user proceeds to where they were going. Acceptable gap until then because we have **zero existing users** at MVP - any version bump landing before s3a.27 would only affect zero accounts.
- **Self-serve "view your acceptance history" page.** Privacy-conscious users may want to see what they accepted and when. OUT. Recommend documenting as **not-needed-for-MVP** rather than filing a Bead - the data is in the table, available on legal request; a UI surface for it is not on a critical path. If a user asks for it, file then.
- **`ip` and `user_agent` collection - the privacy tradeoff.** RECOMMEND collecting both, with masking:
  - **`ip`** (nullable text) - mask to /24 for IPv4, /48 for IPv6 before storing. e.g. `192.168.1.42` -> `192.168.1.0`; `2001:db8:abcd:1234::1` -> `2001:db8:abcd::`. The mask happens in `lib/tos.ts` before the insert; the raw IP never reaches the DB. Resolution comes from a Next.js request header (`x-forwarded-for` / `x-real-ip`) accessed via `headers()` in the server action and passed into `acceptCurrentTos`.
  - **`user_agent`** (nullable text) - truncate to 256 chars before storing. UA strings are already public-by-design from the browser; truncation is a belt-and-braces against bloated UA bots and accidental log size.
  - **Why collect at all.** A future abuse complaint ("did this user actually accept the ToS?") needs `(profile_id, version, accepted_at)` to demonstrate record-keeping in good faith. Adding masked `ip` + truncated `user_agent` strengthens that demonstration without adding meaningful PII risk.
  - **Why not collect.** A purist privacy posture would say `(profile_id, version, accepted_at)` is sufficient and any IP / UA collection requires its own privacy-policy disclosure line. Either posture is defensible. Open decision flagged below; the recommendation here is to collect masked, document the masking in the migration header, and revisit if a privacy concern surfaces.

## 3. Architecture

### Module placement

| File | Runtime | Why |
|---|---|---|
| [`lib/legal.ts`](#) | server-only (`import "server-only"`) | Constants/types only, but pinned server-only so the constant is never accidentally inlined into the browser bundle (e.g. via a future client component importing it). The version string is harmless on the client; the discipline keeps the legal namespace consistent. |
| [`lib/tos.ts`](#) | server-only | Talks to Supabase under the user's session cookie. Same boundary discipline as [`lib/profiles.ts`](#) and [`lib/follows.ts`](#). |
| [`app/onboarding/handle/actions.ts`](#) | `"use server"` Server Action | Already exists; receives the FormData submission. |
| [`app/onboarding/handle/handle-form.tsx`](#) | `"use client"` | Already exists; owns the pending state and the live `@handle` preview. |
| [`app/onboarding/handle/page.tsx`](#) | server component | Already exists; renders the form and reads `?error=` codes. |

### Data-flow (happy path)

1. User loads `/onboarding/handle`. Server component renders the form, which now contains the new required checkbox above the submit button.
2. User fills handle + display name, ticks the checkbox, submits.
3. Browser POSTs the FormData containing `handle`, `display_name`, and `tos_accepted=on` (HTML checkbox convention - browsers send `name=on` only when checked).
4. `submitHandleAction` runs:
   - Reads `tos_accepted` from FormData. If it is **not** the literal string `"on"`, immediately `redirect("/onboarding/handle?error=tos_required")`. No `withRateLimit` call, no DB write, no rate-limit slot consumed.
   - Existing `withRateLimit(RATE_LIMITS.HANDLE_CREATE, () => createProfile({ handle, displayName }))` runs. Validation, insert, error-mapping all unchanged.
   - On `createProfile` success: call `withRateLimit(RATE_LIMITS.TOS_ACCEPT, () => acceptCurrentTos({ ip, userAgent }))`. The `ip` / `userAgent` are resolved from `headers()` inside the action (or pulled in `lib/tos.ts` if cleaner; recommend the action so `lib/tos.ts` stays parameterized).
   - On `acceptCurrentTos` success: `redirect("/")`.
   - On `acceptCurrentTos` `unauthorized` / `unknown`: `redirect("/onboarding/handle?error=<code>")` - both codes are already mapped by `errorMessageFor`. Note: `unauthorized` is essentially impossible here because `createProfile` just succeeded, but we handle the result discriminant cleanly anyway.
   - On `acceptCurrentTos` `rate_limited`: `redirect("/onboarding/handle?error=rate_limited")` - existing copy applies.

### Data-flow (hostile / edge)

- **Bypass without the checkbox.** A scripted client POSTs the form omitting `tos_accepted`. Server-side check rejects -> `?error=tos_required`. Same outcome if the client sends `tos_accepted=off` or any value other than `"on"`.
- **Tampering with the field value.** A scripted client POSTs `tos_accepted=on` even though the user never saw the checkbox in their UI. Outside our threat model - same posture every consumer-web ToS uses. The audit row's `accepted_at + ip + user_agent` provides the legal record we can produce on request.
- **Replay / inflated acceptance attempts.** `withRateLimit(RATE_LIMITS.TOS_ACCEPT, ...)` caps insert attempts at 10/hour. Cap is generous because legitimate flow is one acceptance per onboarding plus one per version bump.
- **Double-submit (user clicks Submit twice).** The composite `UNIQUE (profile_id, version)` constraint plus `INSERT ... ON CONFLICT DO NOTHING` means the second insert is a no-op; `acceptCurrentTos` returns `{ ok: true, alreadyAccepted: true }` instead of an error. Idempotent at both the SQL layer and the helper layer.
- **PII exfiltration.** RLS lets each authenticated user read **only their own** rows (`auth.uid() = profile_id`); the moderator role can read all rows for abuse investigations. Anonymous role gets nothing.
- **Profile-creation race.** `createProfile` already handles its own uniqueness via the existing `23505` -> `handle_taken` mapping. This chunk does not change that path.

### Idempotency

`acceptCurrentTos()` is **idempotent for the same (profile_id, version) pair**. Implementation: insert with `ON CONFLICT (profile_id, version) DO NOTHING`. The helper detects the no-op via the result row count (or RETURNING check) and returns `{ ok: true, alreadyAccepted: boolean }`. The DB-level UNIQUE is the source of truth; the helper just surfaces the no-op cleanly.

### Threat-model summary (per [`project-architecture`](../../.cursor/skills/project-architecture/SKILL.md))

1. **Who can READ?** The owner (`auth.uid() = profile_id`); the moderator role (`is_moderator(auth.uid())`); nobody else, including `anon`.
2. **Who can WRITE?** The owner (insert their own row only). No update path. No delete path.
3. **What if someone outside that set sends the request anyway?** SELECT for someone else's rows returns zero rows. INSERT for someone else's `profile_id` rejected by the with-check. UPDATE / DELETE rejected by absence of any policy.
4. **Logs / PII?** `profile_id` (FK to auth.users), `version` (opaque string), `accepted_at`, masked `ip`, truncated `user_agent`. No money. No image content. No message content. The money-privacy hard rule from ADR 0002 is unaffected: nothing in this migration touches monetary tables.

## 4. Schema sketch

```sql
create table public.tos_acceptances (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references auth.users(id) on delete cascade,
  version       text not null
                  check (length(version) between 1 and 64),
  accepted_at   timestamptz not null default now(),
  ip            text
                  check (ip is null or length(ip) <= 64),
  user_agent    text
                  check (user_agent is null or length(user_agent) <= 256),
  unique (profile_id, version)
);

create index tos_acceptances_profile_id_idx
  on public.tos_acceptances (profile_id);

alter table public.tos_acceptances enable row level security;

create policy "tos_acceptances_select_own"
  on public.tos_acceptances
  for select
  to authenticated
  using (auth.uid() = profile_id);

create policy "tos_acceptances_select_moderator"
  on public.tos_acceptances
  for select
  to authenticated
  using (public.is_moderator(auth.uid()));

create policy "tos_acceptances_insert_own"
  on public.tos_acceptances
  for insert
  to authenticated
  with check (auth.uid() = profile_id);

-- No update policy. No delete policy. Acceptance rows are immutable audit records.
```

### Notes on the schema choices

- **`profile_id` references `auth.users(id)` with `on delete cascade`.** Same posture as [`profiles`](../../supabase/migrations/20260419013009_profiles.sql) and [`rate_limit_counters`](../../supabase/migrations/20260419050100_rate_limits.sql). Cascading delete is appropriate because if the auth row is deleted (account removal), the acceptance is moot - there is no ongoing legal posture to record-keep against. Document this choice in the migration header.
- **Composite UNIQUE `(profile_id, version)`.** Idempotency at the DB level. Combined with `ON CONFLICT DO NOTHING` in the helper, the second submit is a clean no-op rather than an exception path.
- **Index on `(profile_id)`.** Supports the `hasAcceptedCurrentTos(profileId)` lookup. The UNIQUE on `(profile_id, version)` already covers `(profile_id, ...)` prefix lookups, but the explicit single-column index is cheaper for the common "any acceptance for this user?" path and is the index that `project-review-checklist-sql.mdc` expects on every column referenced in an RLS predicate.
- **No update / delete policies.** These rows are audit records. Even the user cannot retract an acceptance. If the user deletes their account, `on delete cascade` removes the row alongside the auth row - the deletion is tied to the account lifecycle, not to a per-row choice. Document this prominently in the header so a future agent doesn't add an "edit acceptance" UI without re-opening the threat model.
- **`ip` and `user_agent` masked / truncated by the helper before insert.** The DB only stores the masked / truncated form. The check constraints are length guardrails, not the masking implementation - the masking lives in TypeScript so it is testable and reviewable in PRs.

### Migration header comment block

The header must cite:

- The deferred AC line from `tripplanner-s3a.17` this chunk closes ("Sign-up flow gates on accepting the ToS (checkbox + dated acceptance row)").
- The Phase 2 lawyer-review framing from [`docs/adr/0002-social-vision-pivot.md`](../../docs/adr/0002-social-vision-pivot.md) - this is template-doc acceptance, not counsel-reviewed acceptance.
- Why update + delete policies are intentionally absent (immutable audit records).
- The IP / UA masking choice (mask in helper, store masked, length-checked at the DB).
- Threat model in the standard four-question format from [`project-architecture`](../../.cursor/skills/project-architecture/SKILL.md).
- That this migration does **not** touch any monetary table - the money-privacy hard rule is unaffected.

## 5. Helpers

### `lib/legal.ts` (NEW)

```ts
import "server-only";

/**
 * Single source of truth for the currently-published ToS version.
 *
 * Bump this string when the wording on /legal/{terms,community-guidelines,
 * privacy} changes materially. The acceptance gate checks against this
 * constant; any signed-in user whose latest tos_acceptances row is for an
 * older version becomes "not currently accepted" and (per s3a.27) will
 * be routed to an in-app re-acceptance interstitial on next sign-in.
 *
 * Format is opaque - human-readable for the audit trail, not parsed by
 * code. Convention: 'v<n.m>-<YYYY-MM-DD>' to make ordering eyeballable in
 * the moderator queue.
 */
export const CURRENT_TOS_VERSION = "v1.0-2026-04-19";

export type TosVersion = string;
```

### `lib/tos.ts` (NEW) - signatures only

```ts
import "server-only";

import { CURRENT_TOS_VERSION, type TosVersion } from "@/lib/legal";

/**
 * Result of recording an acceptance for the current ToS version.
 * `alreadyAccepted: true` is the idempotent no-op case (a row for
 * (profile_id, CURRENT_TOS_VERSION) already exists).
 */
export type AcceptResult =
  | { ok: true; alreadyAccepted: boolean }
  | { ok: false; error: "unauthorized" | "unknown" };

/**
 * Record (or no-op) an acceptance row for the signed-in user against
 * CURRENT_TOS_VERSION. Idempotent on (profile_id, version) via the
 * UNIQUE constraint + ON CONFLICT DO NOTHING. Optional masked ip +
 * truncated userAgent are stored for audit; pass null/undefined to skip.
 */
export async function acceptCurrentTos(opts?: {
  ip?: string | null;
  userAgent?: string | null;
}): Promise<AcceptResult>;

/** True when the given profile has an acceptance row for CURRENT_TOS_VERSION. */
export async function hasAcceptedCurrentTos(profileId: string): Promise<boolean>;

/** Re-export of the constant for call sites that prefer a function shape. */
export function getCurrentTosVersion(): TosVersion;
```

Implementation notes for the subagent:

- Use `createClient` from `@/lib/supabase/server` (per-request server client carrying the user's session cookie). The `insert` runs against RLS, which the `tos_acceptances_insert_own` policy permits exactly when `auth.uid() = profile_id`. No service-role usage.
- For idempotency, the cleanest shape is `.insert({...}, { count: "exact" })` and treating zero affected rows as `alreadyAccepted: true`. If the supabase-js client surface makes `ON CONFLICT DO NOTHING` awkward to express, fall back to a `select` + conditional `insert` - document the choice in the helper's header. Both are correct; the SQL `UNIQUE` is the safety net.
- IP masking helpers (`maskIpv4`, `maskIpv6`) live in `lib/tos.ts` (or a private module imported by it); they are pure functions and testable.
- `userAgent` truncation: `userAgent?.slice(0, 256) ?? null`.

### `lib/rate-limit.ts` (MODIFY - additive only)

Add **one** new entry to the existing `RATE_LIMITS` const:

```ts
TOS_ACCEPT: {
  surface: "tos_accept",
  // 10 / hour. Generous because the legitimate flow is one acceptance per
  // onboarding plus one per version bump - this cap is anti-bot, not
  // anti-user. Tighten if real abuse appears (file a follow-up Bead).
  max: 10,
  windowSeconds: 60 * 60,
},
```

Constraints:

- Do **not** modify `withRateLimit`.
- Do **not** modify the `RateLimitResult` discriminated union.
- Do **not** change `HANDLE_CREATE` or any other existing entry.
- Do **not** add a new `surface` value to the migration's documented thresholds (the migration is immutable). The new entry is a TS-only addition; the SQL function accepts any surface string already.
- Mirror the cap in a code comment **only**. The migration's threshold-comment block is intentionally not edited (immutability discipline from [`tasks/lessons.md` 2026-04-19 parallel-chunks lesson](../../tasks/lessons.md)).

## 6. UI surface

### `app/onboarding/handle/handle-form.tsx` modifications

- Add a `<fieldset>` directly above the submit button containing one required checkbox.
- The checkbox + label sit inside a single `<label>` so the entire row is the click target. Tap-target floor: ≥ 44 px combined; the visible checkbox is at least 24x24 px.
- HTML5 `required` attribute on the checkbox. If the user tries to submit without it, the browser shows its native validation tooltip; the server-side `?error=tos_required` is the belt-and-braces (and the only check that runs against scripted clients).
- Name attribute: `tos_accepted`. Browsers send `tos_accepted=on` only when the box is checked.
- Disabled while pending (matches the existing inputs).
- Inline hint string below the label: _"These are template documents - not lawyer-reviewed at MVP."_ Programmatically associated via `aria-describedby` pointing at the hint id.
- No emoji. No exclamation marks. No "denied" / "blocked" framing. Warm copy register matches the existing form.
- Mobile-first: vertical stack. Checkbox sits **above** the submit button, never beside it on narrow viewports.

### Proposed checkbox label copy

> "I have read and agree to Jettison's Terms of Service, Community Guidelines, and Privacy Policy."

Each of the three doc names is a `<Link>` element:

- "Terms of Service" -> `/legal/terms`
- "Community Guidelines" -> `/legal/community-guidelines`
- "Privacy Policy" -> `/legal/privacy`

No `target="_blank"`, no `rel="noopener"` for new tabs - the documents open in the same tab. The user can use the back button to return to the form; their handle + display-name input is preserved in the form state by the browser's native form-restoration on back-navigation. (Honors the no-popup-during-onboarding pattern from [`app/_components/footer.tsx`](../../app/_components/footer.tsx) and the existing footer link behavior.)

The links are visually underlined (`underline decoration-hairline underline-offset-4`, matching the footer pattern) so they read as obviously clickable inside the label string. No color change beyond the existing `text-secondary` -> `hover:text-ink` transition the footer already uses. The links inside the `<label>` use `onClick` propagation defaults - clicking a link does not toggle the checkbox because the browser treats nested `<a>` clicks as the link target, not the label target. This is desired.

### `app/onboarding/handle/page.tsx` modifications

Extend `errorMessageFor`:

```ts
case "tos_required":
  return "Please read and accept the three documents first.";
```

Match the warmth of the existing strings (the `rate_limited` string from s3a.14 is the model: complete sentence, no scolding, no exclamation marks, no emoji). The `errorFieldFor` switch does **not** need a new case - the ToS error is form-wide, not field-scoped, so it renders via the existing `error && !errorField` path that surfaces a top-level `<p role="alert">`.

Verify with `Grep` that `errorMessageFor` is defined in exactly one place (this file) before editing - if a refactor has split it out into a shared helper since the s3a.14 plan was written, update the shared helper instead and document the location in the report-back.

## 7. Verification

- `pnpm tsc --noEmit` exit 0.
- `pnpm lint` exit 0 (no warnings).
- `ReadLints` clean on every touched file.
- `supabase db push --linked` applies the migration cleanly (parent agent runs this, not the subagent).
- `supabase gen types typescript --linked > database.types.ts` regenerates with the `tos_acceptances` table type present in `Database["public"]["Tables"]` (parent agent runs this, not the subagent).
- **Smoke-test SQL** (parent agent runs after push). Pick a real test profile (or create one in a sandbox project):
  - Insert as user A: `insert into public.tos_acceptances (profile_id, version) values ('<uuid-A>', 'v1.0-2026-04-19');` -> succeeds.
  - Insert again as user A for the same version -> succeeds via `ON CONFLICT DO NOTHING` no-op (zero affected rows). If using a manual SQL session without the helper, the same statement re-run errors with `unique_violation 23505` - that is the same constraint surface, just unmediated; the helper swallows it cleanly.
  - Insert as user A for a different version (`v1.1-2026-09-01`) -> succeeds (separate row).
  - As user B, `select * from public.tos_acceptances where profile_id = '<uuid-A>';` -> zero rows under RLS.
  - As a moderator profile (`is_moderator = true`), the same select -> all rows for user A.
  - As `anon`, any select -> zero rows.
  - Cleanup: `delete from public.tos_acceptances where version like 'v1.%';` from a service-role session.
- **Functional smoke** (parent agent or human, after dev server is up):
  - `curl -i -X POST http://localhost:3000/onboarding/handle -d 'handle=smoketest&display_name=Smoke%20Test'` (no `tos_accepted` field) -> `303` or `302` redirect to `/onboarding/handle?error=tos_required`. The page renders the warm copy.
  - Same `curl` with `tos_accepted=on` appended -> success path completes (subject to the rate-limit slot being available).
- **Boundary `rg`** (per [`tasks/lessons.md` 2026-04-19 secrets lesson](../../tasks/lessons.md)):
  - `rg -n 'SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|sb_secret_' app/ lib/ proxy.ts` returns only doc-comment matches (the existing matches in `lib/supabase/*.ts` and the existing rule cites). No new matches in `lib/legal.ts`, `lib/tos.ts`, or the modified onboarding files.
- **Money-privacy `rg`**: `rg -n 'tos_acceptances' supabase/migrations/` matches only the new migration; that migration contains no references to `expenses`, `expense_shares`, `payouts`, or any other monetary table. Trivially passes the money-privacy hard rule.
- **Brand voice `rg`**: `rg -in 'jettison your' app/onboarding/ app/legal/ app/_components/` returns zero matches (no verb usage in onboarding or legal copy).

## 8. Bead bookkeeping (parent agent runs this)

- **Create `tripplanner-s3a.27`** - _feat: in-app re-acceptance flow on ToS version bump_, P2, parent `s3a`, `--blocked-by tripplanner-s3a.24`, `--discovered-from tripplanner-s3a.24`. Sketch AC: any signed-in user without an acceptance row for `CURRENT_TOS_VERSION` is routed to a `/legal/accept` interstitial on next sign-in (route guard in `proxy.ts` or in `requireProfile`); the interstitial reuses the same checkbox + three-link label pattern; on submit the new acceptance row is written via `acceptCurrentTos()` and the user proceeds to the originally-intended destination; an in-app banner appears for users who have not yet accepted but are not yet at a route gated by the guard, prompting them to review the updated documents.
- **Append a note to `tripplanner-s3a.17`** (closed) documenting that its deferred AC line - "Sign-up flow gates on accepting the ToS (checkbox + dated acceptance row)" - is now closed by `tripplanner-s3a.24`. Cross-link.
- **Close `tripplanner-s3a.24`** with a shipped-note. Outline:
  > Shipped: tos_acceptances table + RLS (own-row select, moderator select, own-row insert, no update, no delete) in `supabase/migrations/20260419190200_tos_acceptances.sql`. `lib/legal.ts` exposes `CURRENT_TOS_VERSION = 'v1.0-2026-04-19'`; `lib/tos.ts` provides `acceptCurrentTos`, `hasAcceptedCurrentTos`, `getCurrentTosVersion`. `RATE_LIMITS.TOS_ACCEPT` (10/hour) added to `lib/rate-limit.ts`. The onboarding form gains a single required checkbox above the submit button whose label inlines `/legal/terms`, `/legal/community-guidelines`, `/legal/privacy` links; `submitHandleAction` rejects submissions without the checkbox via `?error=tos_required`. `errorMessageFor` extended with the warm copy. Closes the deferred AC line from `tripplanner-s3a.17`. **Out of scope (deferred to `tripplanner-s3a.27`):** in-app re-acceptance UX when `CURRENT_TOS_VERSION` bumps for existing users.

## 9. File-scope contract for the implementation subagent

### OWNS (may create or modify - exhaustive)

- [`supabase/migrations/20260419190200_tos_acceptances.sql`](#) (NEW) - pre-allocated timestamp, after the existing `20260419050000_blocks_mutes.sql` and `20260419050100_rate_limits.sql`.
- [`lib/legal.ts`](#) (NEW).
- [`lib/tos.ts`](#) (NEW).
- [`lib/rate-limit.ts`](#) (MODIFY - additive only: one new entry in `RATE_LIMITS`. Do NOT change `withRateLimit`, `RateLimitResult`, `RateLimitSpec`, or any existing entry).
- [`app/onboarding/handle/handle-form.tsx`](#) (MODIFY - additive only: add the checkbox + label fieldset above the submit button. Do NOT change the existing handle / display-name fields or the live-preview wiring).
- [`app/onboarding/handle/actions.ts`](#) (MODIFY - narrow change: gate `createProfile` on `tos_accepted`; on success path, call `acceptCurrentTos` wrapped in `withRateLimit(RATE_LIMITS.TOS_ACCEPT, ...)` before the final `redirect("/")`; add the new error-redirect for `tos_required`).
- [`app/onboarding/handle/page.tsx`](#) (MODIFY - narrow change: one new `case "tos_required"` in `errorMessageFor`).

### MUST NOT TOUCH (exhaustive)

- **Every existing migration** under `supabase/migrations/` - especially [`20260419050100_rate_limits.sql`](../../supabase/migrations/20260419050100_rate_limits.sql) (the rate-limit migration). Do not modify its SQL function, its table, or even its comment block. The new `TOS_ACCEPT` entry goes in the TypeScript `RATE_LIMITS` constant only; the migration's documented-thresholds comment is intentionally **not** edited (migration immutability per [`tasks/lessons.md` 2026-04-19 parallel-chunks lesson](../../tasks/lessons.md) and the [`project-supabase`](../../.cursor/skills/project-supabase/SKILL.md) "Migration immutability" section).
- The `withRateLimit` function body or the `RateLimitResult` / `RateLimitSpec` types in `lib/rate-limit.ts` - strictly additive change to `RATE_LIMITS` only.
- Every other module under `lib/` - [`lib/profiles.ts`](../../lib/profiles.ts), [`lib/follows.ts`](../../lib/follows.ts), [`lib/blocks.ts`](../../lib/blocks.ts), [`lib/supabase/*.ts`](../../lib/supabase/).
- [`app/page.tsx`](../../app/page.tsx) and [`app/layout.tsx`](../../app/layout.tsx).
- All Server Actions under [`app/_actions/`](../../app/_actions/).
- All shared client components under [`app/_components/`](../../app/_components/) - including [`follow-button.tsx`](../../app/_components/follow-button.tsx), [`block-link.tsx`](../../app/_components/block-link.tsx), [`footer.tsx`](../../app/_components/footer.tsx).
- The three legal pages under [`app/legal/`](../../app/legal/) - the wording is correct as it shipped in s3a.17 and is not in scope here.
- [`database.types.ts`](../../database.types.ts) - the parent agent regenerates this once after `supabase db push --linked`, not the subagent.
- [`tasks/todo.md`](../../tasks/todo.md) and [`tasks/lessons.md`](../../tasks/lessons.md) - the parent agent owns these.
- [`proxy.ts`](../../proxy.ts) - the route-guard for re-acceptance is `s3a.27`'s territory, not this chunk.

## 10. Risks and open decisions

1. **IP / UA collection vs not collecting at all.** RECOMMEND the masked / truncated version above (mask in `lib/tos.ts`, store masked, length-check at the DB). Alternative: skip both columns entirely and rely solely on `(profile_id, version, accepted_at)`. The Phase 2 trust-and-safety brief argues for collecting; the privacy posture argues for skipping. **The user should redline this before the subagent runs** - changing this decision after the migration ships requires a follow-up migration to drop the columns.
2. **`ON CONFLICT DO NOTHING` vs `select-then-insert` for idempotency.** RECOMMEND `ON CONFLICT DO NOTHING`. It is atomic (no race window between the select and the insert) and removes the need for a transaction. The supabase-js surface for `ON CONFLICT DO NOTHING` is the `.insert(..., { onConflict: "profile_id,version" })` flag plus `ignoreDuplicates: true`; verify the supabase-js version in this repo supports it (the helper falls back to a `select`-then-`insert` if the surface is awkward, with a documented comment).
3. **Checkbox above vs below the submit button.** RECOMMEND **above** (read-then-act order; the consent gate sits between the user's intent ("submit my handle") and the action). The user will redline if they prefer otherwise.
4. **Exact label copy.** RECOMMEND _"I have read and agree to Jettison's Terms of Service, Community Guidelines, and Privacy Policy."_ Variants the user may prefer:
   - _"I agree to Jettison's Terms of Service, Community Guidelines, and Privacy Policy."_ (drops "have read" to be honest about user reality)
   - _"I have read and accept the Jettison Terms of Service, Community Guidelines, and Privacy Policy."_ (drops the possessive)
5. **Defense-in-depth on the existing-profile path.** Consider gating `submitHandleAction` on a check that an *existing* profile row also has a current-version acceptance (i.e. block the action even if a profile already exists but the user has no current acceptance). RECOMMEND **NO** for this chunk - keep the gate at signup. Re-acceptance for existing users is `s3a.27`'s territory and should ride on a route guard, not on the handle-creation action which existing users no longer hit.
6. **Where to read `ip` / `user_agent`.** RECOMMEND in `submitHandleAction` via `headers()` from `next/headers`, then pass into `acceptCurrentTos({ ip, userAgent })`. Keeps `lib/tos.ts` parameterized and testable. Alternative is to call `headers()` inside `lib/tos.ts`, which couples the helper to the App Router request scope.
7. **Will the parallel-chunks contract be honored?** This chunk is **not parallel** - it is the only chunk in flight on this surface, and it owns `lib/rate-limit.ts` in additive-only mode. The previous parallel session that shipped s3a.14 / s3a.16 / s3a.17 owned `lib/rate-limit.ts` for s3a.14; that ownership ended when s3a.14 closed. The constraint here is a different one: the **migration immutability** rule (`20260419050100_rate_limits.sql` is now applied and immutable; the new `TOS_ACCEPT` surface is a TS-only addition that the migration's existing function accepts because it takes any `surface text`). Confirm with the parent agent that no other in-flight chunk also intends to modify `lib/rate-limit.ts` - if there is one, sequence (do not parallelize). See the **Final report** section for the explicit ask.
