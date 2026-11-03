# tripplanner-718: create, edit, delete and leave a trip, plus `/trips/[id]`

**Bead:** [`tripplanner-718`](#) (epic [`tripplanner-2o5`](#), UAT-1 critical path; blocks `2o5.1`, `2o5.2`, `2o5.3`, `2o5.6`, `2o5.9`). **Test plan:** [`docs/uat/uat-1-test-plan.md`](../docs/uat/uat-1-test-plan.md) (S2, S7, §12). **Previous record:** UAT readiness (Phase 0 and 1) shipped in [PR #1](https://github.com/eludden35/maya-travel-app/pull/1); see `git show fd36316:tasks/todo.md`.

## Goal

An onboarded tester can plan a private trip (name, dates, currency, description), open it at `/trips/[id]`, edit it, delete it, leave it, and (as organizer) remove a member. Non-members get "not found"; signed-out visitors get sign-in. No money tables are touched.

## Product decisions

Decided by the founder on 2026-11-02 and recorded in §12 of the test plan (S7-N3, S7-N4 and S8-N4 added):

| # | Question | Decision |
|---|---|---|
| Q4a | Can the organizer leave? | No, not in UAT-1: the organizer stays until the trip is deleted. Handing the role to someone else becomes a post-UAT Bead. |
| Q4b | Can a trip with expenses be deleted? | Only when every balance is zero, the same rule as leaving. Until expenses ship, any trip can be deleted. |
| Q5 | What happens to a shared trip when one member blocks another? | Both stay members. Inside the trip each still sees the other's name, costs and posts, so the ledger reads correctly; the block still stops profile views, follows and DMs. |
| Q7 | Who can edit a trip? | The organizer only (name, dates, description), as the Bead says. |

Defaults (not asked):

- **Private only.** `create_trip` always creates a private trip; there is no visibility control. The `trip_visibility` enum stays.
- **Currency** is picked at creation from USD, CAD, MXN, EUR, GBP and AUD (all two-decimal, matching S4-N4), USD by default, and can't be changed afterwards. `2o5.2` may relax that to "until the first expense".
- **Rate limits:** two new surfaces, `trip_create` (10 per hour) and `trip_write` (60 per hour, shared by edit, delete, leave and remove).

## Design

- **Writes go through RPCs only.** Each RPC is `security definer`, `search_path = ''`, takes identity from `auth.uid()`, validates, and only then charges `consume_rate_limit` in the same transaction (the `complete_onboarding` pattern). Clients lose INSERT, UPDATE and DELETE on `trips` and DELETE on `trip_members`, and the old write policies are dropped. A direct API call can't skip the limit or flip `visibility`.
  - This deviates from the AC wording ("Server Actions wrap them with withRateLimit"): charging inside the RPC is stricter, and wrapping as well would charge twice.

| RPC | Caller | Statuses |
|---|---|---|
| `create_trip(name, currency, description, start_date, end_date)` → `(status, trip_id)` | any onboarded user | `ok`, `invalid_name`, `invalid_description`, `invalid_dates`, `invalid_currency`, `rate_limited`, `unauthorized` |
| `update_trip(trip_id, name, description, start_date, end_date)` | organizer | `ok`, `not_found`, `forbidden`, `invalid_*`, `rate_limited`, `unauthorized` |
| `delete_trip(trip_id)` | organizer | `ok`, `not_found`, `forbidden`, a departure blocker (none until `2o5.3`), `rate_limited`, `unauthorized` |
| `leave_trip(trip_id)` | member | `ok`, `not_found`, `organizer_cannot_leave`, `rate_limited`, `unauthorized` |
| `remove_trip_member(trip_id, profile_id)` | organizer | `ok`, `not_found`, `forbidden`, `not_a_member`, `cannot_remove_organizer`, `rate_limited`, `unauthorized` |

- **One place for the balance rule.** `leave_trip` and `remove_trip_member` lock the membership row and ask `private.trip_departure_blocker(trip_id, profile_id)`, which returns `null` today. `delete_trip` asks the same function for every member (Q4b). `2o5.3` redefines only that function to return `unsettled_balance`.
- **Member list.** `get_trip_members(trip_id)` (members only) returns each co-member's handle and display name even across a block (Q5). Profile RLS is unchanged, so outside the trip the block still hides the blocker.
- **Not found means not found.** An unknown id, a malformed id and a trip you can't see all render the same `notFound()`. Signed-out visitors go to `/auth/sign-in?next=/trips/[id]` before anything loads.

## Plan

- [x] Migration `supabase/migrations/20261102180000_trip_lifecycle.sql`: `trips.currency`, revoked writes and dropped write policies, the RPCs above, the departure hook, the two rate-limit rules.
- [x] pgTAP `supabase/tests/database/010-trip-lifecycle.test.sql`; update `007-trip-membership.test.sql` for the RPC-only model.
- [x] Regenerate `database.types.ts` from the local stack.
- [x] `lib/trips.ts`: `createTrip`, `updateTrip`, `deleteTrip`, `leaveTrip`, `removeTripMember` returning result unions. `lib/trip-fields.ts`: `TRIP_CURRENCIES` and form parsing. `lib/trip-dates.ts`: date-range formatting in UTC (the home showed Dec 3 for a Dec 4 trip west of UTC). Vitest for both. `lib/rate-limit.ts`: register the two surfaces.
- [x] `app/_actions/trips-actions.ts`: `isUuid` guards, redirects, `revalidatePath`.
- [x] UI:
  - `/trips/new`: name, dates, currency, description; "Create trip" in an anchored bottom bar.
  - `/trips/[id]`: header (name, dates, currency, description) and members (organizer first). The organizer gets Edit, Remove and Delete; a member gets Leave. Destructive actions confirm in a native `<dialog>`.
  - `/trips/[id]/edit`: organizer only; currency read-only.
  - Home: "Plan a trip" link; trip rows link to `/trips/[id]`. The trips-first rework stays with `2o5.9`.
- [x] Playwright: extend `e2e/smoke.spec.ts` to create a trip, open it, edit it and delete it, then check the old URL is "not found".
- [x] §12 answers in the test plan, with S7-N3, S7-N4 and S8-N4.
- [x] Beads: notes on `718`, `2o5.1`, `2o5.2`, `2o5.3`, `2o5.6`, `2o5.9`.
- [x] Post-UAT follow-up Bead for organizer hand-off: `tripplanner-tbm`.
- [ ] PR against `main`, CI green, Bead updated: [PR #3](https://github.com/eludden35/maya-travel-app/pull/3) is open; close `718` when it merges.

## Verification

- `pnpm test:db`. In `010`, as anon, as two signed-in users and as a stranger, check that:
  - anon has no EXECUTE on any of the RPCs;
  - direct INSERT, UPDATE and DELETE on `trips`, and DELETE on `trip_members`, fail with 42501;
  - `create_trip` makes a private trip in the chosen currency with the organizer's membership, and charges `trip_create`;
  - each invalid input returns its status and writes nothing;
  - a stranger gets `not_found` everywhere and changes nothing;
  - a member gets `forbidden` on edit, delete and remove;
  - a member can leave, and loses access when they do;
  - the organizer can't leave;
  - the organizer can remove a member;
  - deleting a trip removes its members;
  - going over the limit returns `rate_limited`;
  - the Q5 rule holds.
- `pnpm test` (date formatting), `pnpm typecheck`, `pnpm lint`, `pnpm check:secrets`.
- `pnpm test:e2e` (mobile Chromium).
- By hand in the browser, with the seed users:
  - Bob leaves "Lisbon long weekend", and Alice removes a member.
  - Signed out, the trip page redirects to sign-in.
  - A stranger gets "not found".
  - At 360px nothing scrolls sideways.
  - Every tap target is at least 44px.
- CI green on the PR.

## Review

### Shipped

- **Migration** `20261102180000_trip_lifecycle.sql`:
  - adds `trips.currency`;
  - revokes client writes on `trips` and `trip_members` and drops their write policies;
  - adds the RPCs `create_trip`, `update_trip`, `delete_trip`, `leave_trip`, `remove_trip_member` and `get_trip_members`;
  - adds `private.trip_departure_blocker`, the one place for the balance rule;
  - adds the rate-limit surfaces `trip_create` (10 an hour) and `trip_write` (60 an hour).
- **Library:** write helpers with result unions in `lib/trips.ts`; `lib/trip-fields.ts` and `lib/trip-dates.ts`; `requireProfileFor` in `lib/profiles.ts`; and `app/_actions/trips-actions.ts`.
- **UI:**
  - `/trips/new`, `/trips/[id]` (with a loading state) and `/trips/[id]/edit`.
  - A trip form and a confirm dialog.
  - Home links each trip and offers "Plan a trip".

### Evidence (2026-11-02, local stack)

- `pnpm test:db`: 11 files, 134 tests. 55 are new in `010-trip-lifecycle`, and `007` is updated for RPC-only writes.
- `pnpm test`: 56 tests, 24 of them new. Removing `timeZone: "UTC"` fails 5 of them, so they guard the date fix.
- `pnpm typecheck`, `pnpm lint` and `pnpm check:secrets` are clean. `supabase db lint` (public, private) finds no errors. `pnpm build` succeeds.
- `pnpm test:e2e` passes against both `pnpm dev` and the production build. It covers create, open, edit, the home link, the signed-out redirect (S2-N2), delete, and "not found" afterwards.
- By hand at 375px and 360px with the seed users:
  - Checked the organizer and member views.
  - An edit the server refuses keeps the other fields.
  - Bob leaves; Alice removes Bob; delete works.
  - A member's `/edit` and a malformed id both show "Nothing here."
  - A 120-character name causes no sideways scroll.
  - Every tap target on the trip pages is at least 44px.
- Signed out, fetched as a link-preview client from the production build: every trip URL returns only the "Trip · Jettison" title and a skeleton, then redirects to sign-in. No trip or member text is in the HTML.

### Lenses

- **Architecture.** Writes are RPC-only, and each RPC charges the rate limit inside its own transaction. That is stricter than the AC's `withRateLimit` wording, and wrapping as well would charge twice. Leave, remove and delete share one departure hook. Leave and remove lock the membership row; delete locks the trip row.
- **PM.** The founder answered §12 Q4, Q5 and Q7, and checks S7-N3, S7-N4 and S8-N4 reflect the answers. Defaults not asked about: trips are private only, and the six currencies all have two decimals and are fixed at creation.
- **UI/UX.** The trip page reuses the existing motifs: the mono eyebrow, Fraunces display type, layered warm surfaces, and an anchored bottom bar on the forms. Destructive actions confirm in a native modal dialog with Cancel focused first. The member count is announced after a removal.
- **Code review.** No raw database text reaches the UI. Ids are checked with `isUuid`. The signed-out redirect happens before any trip read.

### Notes

- Because of `loading.tsx`, a signed-out visit to a trip streams a skeleton and redirects with a meta refresh (HTTP 200) rather than a 307. The response contains no trip data. `/trips/new` has no loading boundary, so it returns a real 307.
- `trips.currency` is readable wherever the trip is, because it's a unit, not an amount. Public and unlisted trips can't be created in UAT-1.
- Pre-existing and outside this chunk: the home page's "Block @handle" links are 16px tall. `tripplanner-2o5.11` covers 44px targets.

### Follow-ups

- `tripplanner-tbm`: hand the organizer role to another member (post-UAT).
- `tripplanner-2o5.3`: redefine `private.trip_departure_blocker` to return `unsettled_balance`, and add that status to the leave, remove and delete results and their copy.

---

# tripplanner-2o5.1: trip invite links (`trip_invites`, `accept_trip_invite`, `/join/[token]`)

**Bead:** `tripplanner-2o5.1` (epic `tripplanner-2o5`; blocks `2o5.9` and `2o5.13`). **Test plan:** S2 steps 3–4, S3, S7 step 6, PV2, PV6 and §12 Q6 in [`docs/uat/uat-1-test-plan.md`](../docs/uat/uat-1-test-plan.md). **Status (2026-11-03):** built and verified locally; PR and CI pending. The founder accepted every recommended answer below on 2026-11-03.

## Goal

The organizer makes a link for their trip, shares it, and can turn it off or replace it. Whoever opens the link sees what they're invited to, signs in, onboards if they're new (even when their email isn't on the allow-list), and lands in the trip as a member. A dead link gets one plain answer, whatever killed it. Nothing about money or posts shows before joining.

## Founder decisions

Answered by the founder on 2026-11-03: the recommended column, for all four. They're in the test plan's §12 as Q6 and Q8–Q10.

| # | Question | Recommended | Other options |
|---|---|---|---|
| Q6 | Default expiry and maximum uses (§12 Q6) | **7 days and 10 uses.** The organizer can pick 1, 3, 7, 14 or 30 days and 1, 5, 10, 25 or 50 uses. No "never expires" and no "unlimited" while Jettison is invite-only, because each use also lets one new account past the allow-list. | Longer defaults (30 days, 25 uses); allow unlimited |
| Q8 | Is the token stored hashed, or readable by the organizer? | **Readable by the organizer only**, so they can copy or share the same link again at any time. Members, other users and signed-out visitors can't read it. A leaked link is killed by turning it off or replacing it. Shareable group links in other products work this way. | Hashed: the link is shown once, when it's made. Sharing it again later means replacing it, which breaks the copy already sent to the group. |
| Q9 | What if the person joining and the organizer have blocked each other? | **Refuse, and refuse too when they and anyone already in the trip have blocked each other.** They see the same "this invite no longer works" as for a dead link, so the block isn't revealed (ADR 0002: a block is mutual invisibility, and the blocked person never learns of it). §12 Q5 still keeps people who are already members together. | Check the organizer only; or ignore blocks, so Q5 applies once they're in |
| Q10 | Can only the organizer create links? | **Yes**, as the Bead says. Members see neither the link nor the controls (S3-N4); they ask the organizer. | Any member can make and share links |

## Defaults (not asked)

- **One live link per trip.** Making a new link turns the old one off in the same transaction; that's "rotate".
- **Removing a member doesn't turn the link off.** The remove dialog says to replace the link if they still have it, which S7 step 6 already does.
- **Token:** 128 random bits from pgcrypto, written as 22 base64url characters (`/join/Xk3…`).
- **The token leaves the address bar after one hop.**
  - `GET /join/[token]` stores the token in an httpOnly cookie (`jtsn_invite`, 1 hour, cleared on join and sign-out) and redirects to `/join`.
  - Sign-in carries `next=/join`, and onboarding reads the cookie.
  - So the token is never in a `next` parameter, a later URL, a Referer header or browser history.
  - Sentry scrubs any `/join/<token>` path anyway, and no server code logs the token.
  - The first request line stays in the host's access log; any link-based invite has that.
- **Onboarding through an invite joins in the same transaction.** `complete_onboarding` with a live token creates the profile and the membership and counts the use. A 10-use link therefore admits at most 10 new accounts, and nobody can onboard on a link without joining that trip.
- **The preview** shows the trip name, dates, the organizer's display name and the member count, and nothing else. The page `<title>` is generic and there are no Open Graph details, so a chat app's link preview says nothing about the trip (PV5).
- **One answer before sign-in, a reason after.** Before sign-in every dead link gets the same answer. After sign-in, a refusal says why (expired, turned off or full) in warm copy, as the AC asks. A block always gets the generic answer.
- **Someone already in the trip** who opens the link goes straight to the trip, whatever state the link is in (S3 step 5).
- **Rate limits:**
  - `trip_invite`: 30 an hour, for making and turning off links.
  - `trip_join`: 20 an hour, for accepting.
  - Bad or dead tokens are refused before the charge, as in the trip RPCs.
  - The signed-out preview can't use `consume_rate_limit`, which needs `auth.uid()`. A 128-bit token can't be guessed.
- **Pending invites for `2o5.9`.** "Pending invite" can mean the invite opened on this device and not yet accepted (the cookie). This chunk builds no home section for it.

## Design

### Database: one migration, `supabase/migrations/20261103xxxxxx_trip_invites.sql`

- `public.trip_invites` has these columns:
  - `id`;
  - `trip_id`, which references `trips` on delete cascade;
  - `token`, unique, 22 base64url characters;
  - `created_by`, `created_at`;
  - `expires_at`, at most 30 days after creation;
  - `max_uses` (1–50), `uses` (0–`max_uses`);
  - `revoked_at`.

  A partial unique index allows one unrevoked link per trip.
- **RLS ships in the same migration.** Clients get SELECT only, and the only policy lets a trip's organizer read its links. There's no client INSERT, UPDATE or DELETE, and anon gets nothing.
- **RPCs** follow `20261102180000_trip_lifecycle.sql`: security definer, `search_path = ''`, identity from `auth.uid()` only, validation before `consume_rate_limit`, statuses instead of exceptions, and `revoke … from public, anon`.

| RPC | Caller | Answers |
|---|---|---|
| `create_trip_invite(trip_id, expires_in_days, max_uses)` → `(status, invite_id, token)` | organizer | `ok`, `not_found`, `forbidden`, `invalid_expiry`, `invalid_max_uses`, `rate_limited`, `unauthorized` |
| `revoke_trip_invite(invite_id)` | organizer | `ok`, `not_found`, `forbidden`, `rate_limited`, `unauthorized` |
| `accept_trip_invite(token)` → `(status, trip_id)` | onboarded users | `ok`, `already_member`, `invalid`, `expired`, `revoked`, `full`, `rate_limited`, `unauthorized` |
| `get_trip_invite_preview(token)` | anon and signed in | one row with the four preview fields; just the `trip_id` for someone already in the trip; no rows for every dead or blocked case |

- **`accept_trip_invite`** locks the invite row, so two people can't both take the last use. It adds the membership and counts the use in one transaction. Someone who's already a member gets `already_member`, and nothing is counted.
- **Onboarding.** Drop and recreate `can_complete_onboarding` and `complete_onboarding`, each with a new `p_invite_token text default null` argument.
  - Either may proceed when the email is on the allow-list or the token is live.
  - The old migration file stays untouched.
  - Calls without the new argument still resolve, so the app deployed now keeps working while the migration lands.

### App

- **`lib/trip-invites.ts`** (server-only) reads the organizer's newest link and the preview, and makes, turns off and accepts links. It returns result unions like `lib/trips.ts`, with a token-shape check before anything reaches the database.
- **Server Actions** go in `app/_actions/trip-invites-actions.ts`. The invite cookie helpers sit next to the sign-in cookies.
- **`app/join/[token]/route.ts`** sets the cookie and redirects to `/join` with a 303.
- **`app/join/page.tsx`** shows the invitation:
  - Signed out: "Join trip" goes to sign-in.
  - Signed in without a profile: straight to onboarding.
  - Signed in with a profile: "Join trip" accepts, then lands on the trip.
  - A dead link gets the "no longer works" page.
- **Onboarding** (`app/onboarding/handle/*`):
  - passes the token from the cookie and shows "You're joining …";
  - lands on the trip afterwards;
  - the invite-only screen says to open the invite link again on this device.
- **Sign-in:** while an invite is pending, the code step suggests typing the code here, so the invite isn't lost in another app's browser.
- **`/trips/[id]`**, under the header, organizer only, gets an "Invite people" panel:
  - Share, through the Web Share API, falling back to copy with a visible confirmation;
  - Copy, plus expiry and uses left;
  - New link and Turn off link, each with a confirm.

  With no live link, a create form with the two choices. The member-removal copy is updated.
- **Small, additive edits:**
  - `lib/sentry-options.ts`: `beforeSend` and `beforeBreadcrumb` scrub `/join/<token>`, with Vitest.
  - `lib/rate-limit.ts`: `TRIP_INVITE` and `TRIP_JOIN`.
  - `database.types.ts`: hunks spliced in, per the `project-supabase` note.
  - Sign-out clears the invite cookie.

## Plan

- [x] Sync with `main`; take the local-stack lock; `supabase db reset`.
- [x] Migration: table, RLS, the four RPCs, the onboarding change, the two rate-limit rules.
- [x] pgTAP `011-trip-invites.test.sql` as anon, the organizer, a member, a stranger and a not-yet-onboarded invitee. Update `008-privileges` for the new `complete_onboarding` signature.
- [x] Splice `database.types.ts`.
- [x] `lib/trip-invites.ts`, the actions, `/join`, onboarding and sign-in hooks, and the organizer panel.
- [x] Sentry scrubber with Vitest; Vitest for the token-shape check.
- [x] Playwright `e2e/invite-join.spec.ts`, with a shared Mailpit helper in `e2e/support/`:
  - the organizer makes a link;
  - a second browser context with a non-allow-listed address opens it, sees the preview, signs in, onboards and lands in the trip;
  - the organizer sees them in the list;
  - opening the link again goes to the trip;
  - after the organizer replaces the link, the old one gets "no longer works".
- [x] Test plan: answer §12 Q6, add Q8–Q10, and align S2 steps 3–4, S3, S7 step 6 and PV2 with what shipped.
- [ ] Proof, then PR, CI green, and a note on the Bead.

## Verification

- `pnpm test:db`, with the new file covering:
  - anon and non-members can't read `trip_invites`;
  - members can't either;
  - anon can't call `accept_trip_invite` or the write RPCs;
  - expired, revoked, full and unknown tokens are refused, and the preview gives one answer for all of them;
  - accepting twice counts once;
  - the last use can't be taken twice;
  - a new link turns the old one off;
  - only the organizer makes or turns off links;
  - blocks are handled as Q9 decides;
  - charges and limits apply;
  - an invite admits a non-allow-listed account to onboarding and joins it in the same transaction, and a dead one doesn't;
  - joining grants a `member` row and nothing else.

  If the expenses migration (`2o5.2`) reaches `main` first, this also asserts that no money rows are visible before joining.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm check:secrets`, `pnpm build` and `pnpm test:e2e` (on dev and on the production build).
- By hand at 375px and 360px:
  - the preview, the dead-link page, the organizer panel, and Share where the browser offers it;
  - copy-link otherwise;
  - 44px targets throughout;
  - fetched as a link-preview client, `/join/<token>` shows no trip details.

## Review

### Shipped

- **Migration** `20261103200000_trip_invites.sql`:
  - `trip_invites` with RLS in the same migration: only the trip's organizer can read it, and clients never write it;
  - one unrevoked link per trip;
  - `create_trip_invite`, which also rotates;
  - `revoke_trip_invite`;
  - `accept_trip_invite`, which locks the trip and then the link;
  - `get_trip_invite_preview`, open to anon;
  - `complete_onboarding` and `can_complete_onboarding` recreated with `p_invite_token`;
  - the `trip_invite` (30 an hour) and `trip_join` (20 an hour) rate limits.
- **Library:**
  - `lib/trip-invites.ts`: result unions; it reuses `toResult` and `toFailure`, now exported from `lib/trips.ts`.
  - `lib/trip-invite-fields.ts`: token shape, choices and defaults, link state, expiry wording.
  - Invite-cookie helpers in `lib/auth-flow.ts`.
  - `canCompleteOnboarding` and `completeOnboarding` take the token.
- **UI:**
  - `/join/[token]` (cookie, then a 303) and `/join` (the invitation, Join, one dead-link page);
  - the organizer's `InvitePanel` on `/trips/[id]`;
  - the onboarding "Then you're in …" line and invite-aware invite-only screen;
  - the sign-in code-step copy;
  - sign-out forgets the invite.
- **Sentry:**
  - `dataCollection` turns cookies and stack-frame variables off;
  - `beforeSend` and `beforeBreadcrumb` scrub `/join/<token>`.

### Evidence (2026-11-03, local stack)

- **`pnpm test:db`: 12 files, 234 tests.** `011-trip-invites` adds 100; `008` follows the new signature.
  - Three deliberate regressions each fail the new tests, and all were rolled back:
    - no block check fails 7;
    - ignoring expiry fails 10, including the onboarding gate;
    - an open read policy fails 3.
  - `supabase db lint` (public, private) finds no errors.
- **`pnpm test`: 186 tests, 23 of them new.** The Sentry test sends a request through the SDK's own request-data step and fails without `cookies: false`.
- **Static checks:** `pnpm typecheck`, `pnpm lint`, `pnpm check:secrets` and `pnpm build` are clean.
- **`pnpm test:e2e`:** both specs pass against `pnpm dev`, and against the production build when `SITE_URL=http://localhost:3000` is set as in CI.
  - `invite-join` covers S2 steps 3–4, S3 steps 1–5, S3-N1, S3-N4 and S7 step 6.
  - It also checks Copy, using the clipboard.
- **By hand at 375px and 360px:** the preview, the dead-link page, the organizer panel, the turn-off dialog and the create form.
  - Nothing scrolls sideways.
  - No visible target is under 44px.
  - The cookie is httpOnly, and page scripts can't read it.
- **Token exposure:**
  - The token isn't in the `/join` HTML.
  - The redirect is a 303 with `no-store`.
  - It appears only on the first request line in the server log.

### Independent review (subagent, 2026-11-03)

- **P1, fixed:**
  - SDK 11 ignores `sendDefaultPii` and collects cookies by default, so the invite cookie, and the token in it, would have reached Sentry on any server error.
  - The sign-in email cookie had the same exposure on `main`, and is now covered too.
- **P3s, fixed:**
  - The scrubber also rewrote file paths such as `app/join/page.js`.
  - The onboarding gate wasn't tested with an expired or full link that was still on.
- **P3, documented in §12 Q9:** the preview works signed out, so a blocked person who compares the signed-out and signed-in views can infer a block.
- **P3, filed as `tripplanner-x6a`:** invited accounts can make links of their own, so invites can chain past the allow-list.

### Notes

- **Rotation** is `create_trip_invite` replacing the live link; there's no separate rotate RPC. The UI calls it "New link", with the same settings.
- **The AC's "no money rows visible before joining"** can't be asserted yet, because no money table is on `main`. pgTAP asserts that joining adds exactly one `member` row and changes nothing else. The money-privacy matrix in `2o5.2` and `2o5.3` covers non-members.
- **Residual exposure:** the first request line, `GET /join/<token>`, is in the host's access log, as with any link-based invite.
- **Sign-in copy:** the code step shows "carry on with your invite" whenever the cookie exists, even for a dead link. The link page has already said it no longer works.
- **For `2o5.9`:** a pending invite can be the `jtsn_invite` cookie on this device, before it's accepted. `readInviteToken` plus `getTripInvitePreview` give the trip.

### Follow-ups

- `tripplanner-7pl` (P1, now blocks `2o5.13`, entry criterion E4): Sentry still collects client IPs and request bodies (emails, sign-in codes) by default.
- `tripplanner-x6a` (P2, founder decision): whether links made by invite-admitted accounts can admit new accounts.

