# tripplanner-2o5.6: text posts in a trip, Report, and the founder's reports page

**Bead:** [`tripplanner-2o5.6`](#) (epic [`tripplanner-2o5`](#); blocks `2o5.10`, `2o5.13`, `s3a.7`, `s3a.15`). **Test plan:** S6, PV6 and §12 Q1 in [`docs/uat/uat-1-test-plan.md`](../docs/uat/uat-1-test-plan.md). **Status:** the founder approved D1–D4 and the defaults on 2026-11-03. Built and proven on the local stack; the PR is waiting for the founder to merge.

## Goal

Trip members write text posts in their trip and see everyone's, newest first. Nobody else sees any: not anon, a stranger, a follower of a member, or a viewer of a public trip, whatever the trip's visibility. A member can report someone else's post. Only moderators (the founder) see reports, on `/admin/reports`, where they take the post down or dismiss the report, with a note. No photos, comments or reactions.

## Founder decisions

| # | Question | Options | Recommended |
|---|---|---|---|
| D1 | §12 Q1, post half: who can edit or delete a post? | (a) Nobody edits; only the author deletes. (b) The organizer can also delete anyone's post. | **(a)**, as the Bead's AC says. The organizer doesn't police friends' words; reports go to the founder. |
| D2 | What does resolving a report do to the post? | (a) Hide it. (b) Delete it. (c) Nothing; the founder follows up by hand. | **(a) Hide.** Other members stop seeing it. Its author sees it marked "taken down after a report", never who reported it, and can still delete it. Reversible by hand. Dismiss leaves the post up. |
| D3 | Table name | `trip_posts` or `posts` | **`trip_posts`.** Every post lives in a trip; it sits beside `trip_members` and `trip_invites`; PV6 in the test plan already uses it. `s3a.7` adds photo columns to this table rather than a second one. |
| D4 | Length and rate limits | Any numbers | **2,000 characters** (same as a trip description), line breaks kept. **Posts: 10 an hour and 30 a day**, as `s3a.25` suggests (today's reserved `post` rule says 30 an hour). **Reports: 10 an hour.** Deleting your own post isn't limited. |

Defaults I'll use unless the founder objects:

- **A report keeps a copy** of the reported text, its trip and its author, so deleting the post or the trip doesn't erase what was reported. Only the reporter and moderators can read a report.
- **Report reasons**, taken from the Community Guidelines: Harassment or threats; Hate speech; Someone's private information; Sexual content; Spam or a scam; Something else. Plus an optional note of up to 500 characters.
- **One report per person per post.** Nobody can report their own post. After reporting, the button reads "Reported".
- **Taking a post down resolves every open report on it.** Dismissing closes only that one report.
- **Posts stay when their author leaves** or is removed, still under their name. As with the member list (Q5), names inside the trip aren't hidden by a block.
- **Links show as plain text.** Clickable links become a follow-up Bead.
- **No alerts.** The founder checks `/admin/reports` daily during UAT; home shows moderators a "Reports" link with the open count. §9 of the test plan will say so.
- **The posts gate in the security rule.** `.cursor/rules/supabase-security.mdc` says "Posts cannot ship before both close" (the CSAM scan and the moderator queue). ADR 0002 §2 pre-moderates images only, and UAT-1 posts are text only, so the gate applies to photo posts (`s3a.7`). I'll reword that sentence to say so.

## Design

- **Writes are RPC-only,** as in `tripplanner-718`. Each RPC is security definer with `search_path = ''`, takes identity from `auth.uid()`, validates before `consume_rate_limit`, returns a status instead of raising, and revokes `public, anon`. Clients get SELECT only. The AC's "INSERT only for trip members" is checked inside `create_trip_post`, so a direct API call can't skip the rate limit.
- **One migration,** `supabase/migrations/20261103…_trip_posts_and_reports.sql`, with RLS in the same file:
  - `trip_posts`: `trip_id` references trips **on delete cascade**; `author_id` references profiles on delete cascade; `body` of 1 to 2,000 characters, not blank; `created_at`; `taken_down_at` and `taken_down_by` (D2). The SELECT policy is `private.is_trip_member(trip_id)` and either not taken down or yours. It never reads `trips.visibility` or `follows`. Indexed on `(trip_id, created_at desc, id desc)`.
  - `reports`: `reporter_id`; `target_type` (an enum, `trip_post` for now, which `s3a.15` extends); `target_id` with no foreign key, so a report outlives its post; `trip_id` and `target_author_id` (on delete set null); the copied text; `reason`; `note`; `status` (`open`, `resolved` or `dismissed`); `decided_by`, `decided_at` and `decision_note`. One per reporter and target. The SELECT policy is the reporter or `public.is_moderator(auth.uid())`. Clients can't write.
  - Rate-limit rules: `post` becomes 10 an hour; new `post_daily` (30 a day) and `report` (10 an hour).

| RPC | Who | Statuses or rows |
|---|---|---|
| `create_trip_post(trip, body)` → `(status, post_id)` | a member | `ok`, `not_found`, `invalid_body`, `rate_limited`, `unauthorized` |
| `delete_trip_post(post)` | the author (D1) | `ok`, `not_found`, `forbidden`, `unauthorized` |
| `get_trip_posts(trip, before, limit)` | a member | each post with its author's name and handle (shown across a block, Q5), `is_own`, `reported_by_me` and `taken_down`; newest first, 50 a page |
| `report_trip_post(post, reason, note)` | a member who can see the post and didn't write it | `ok`, `not_found`, `own_post`, `already_reported`, `invalid_reason`, `invalid_note`, `rate_limited`, `unauthorized` |
| `list_reports(status)` | a moderator; no rows for anyone else | each report with its copied text, the post's state (up, taken down or deleted), trip name, author, reporter and decision |
| `decide_report(report, resolve or dismiss, note)` | a moderator; `not_found` for anyone else | `ok`, `not_found`, `already_decided`, `invalid_decision`, `invalid_note`, `unauthorized` |

- **Moderator checks happen in three places:** the `reports` SELECT policy, inside `list_reports` and `decide_report`, and on the page, which reads the viewer's own `profiles.is_moderator` and shows "Nothing here." to everyone else (S6-N3). A moderator who isn't in the trip reads only reported text, through `list_reports`; `trip_posts` stays closed to them.
- **UI:**
  - `/trips/[id]`: a "Trip notes" section between "Who's going" and leave/delete, streamed behind Suspense, with warm empty and error states of its own.
    - Composer: "Write a trip note", a character count and "Pin to trip". A refused post keeps its text.
    - Each note shows its text as plain text (S6 step 4), signed with the author's name and @handle, and the time in the viewer's time zone.
    - The author gets Delete, which confirms first. Everyone else gets Report: a dialog with the reasons and a note, then "Thanks for telling us. {Name} won't be told who reported it."
    - "Show older notes" after 50.
  - `/admin/reports`: the open count (announced as it changes), and for each open report the reported text, trip, author, reporter, reason, note and time, with a note field and "Take down" / "Dismiss". Below that, the last 20 decisions with who, when and the outcome. No amounts anywhere (S6-N4).
  - Home: a moderator-only "Reports · N open" link.

## Plan

- [x] Migration `20261103210000_trip_posts_and_reports.sql`: tables, RLS, grants, RPCs and rate-limit rules.
- [x] pgTAP `012-trip-posts.test.sql` and `013-reports.test.sql` (cases under Verification). The siblings both use `011`.
- [x] Regenerate `database.types.ts` locally and splice in only the new hunks (`project-supabase` note).
- [x] Library code:
  - `lib/trip-posts.ts` and `lib/reports.ts`: result unions, `isUuid`, no database text in the UI.
  - `lib/post-fields.ts`: limits and reasons, with a Vitest test that checks them against the migration, as PR #4 does for currencies.
  - `lib/post-time.ts`, with Vitest tests.
  - `lib/rate-limit.ts`: `POST_DAILY` and `REPORT`, added next to `POST` to stay clear of the sibling branches' additions.
  - `lib/rpc-result.ts` (and its test): the RPC status helpers, byte for byte the file in `tripplanner-2o5.2`'s branch, so both merges add the same file. `lib/trips.ts` keeps its own copy, unchanged.
- [x] Actions: `app/_actions/trip-posts-actions.ts` and `app/_actions/reports-actions.ts`.
- [x] UI: the notes section, composer, report dialog and delete; `/admin/reports`; the home link.
- [x] Seed: a moderator, `founder@example.com`, who isn't in any trip, and two sample notes in the Lisbon trip.
- [x] Playwright `e2e/posts.spec.ts` (S6):
  - Bob posts a note containing `<b>hi</b> <script>alert(1)</script>`; it shows as text and no dialog opens.
  - Alice reports it. The founder takes it down with a note.
  - Bob sees it marked; Alice no longer sees it; Alice gets "Nothing here." on `/admin/reports`.
  - Sign-in reads codes with `e2e/support/mailpit.ts`, the same file as in `tripplanner-2o5.1`'s branch, which `e2e/smoke.spec.ts` now imports. `signIn` in `e2e/support/sign-in.ts` deletes the persona's older emails first, because the seed accounts get a new code every run.
- [x] Test plan: answer §12 Q1 (post half); in S6, the route and the decisions; in S6-N5, the limits; in PV6, add `reports`; in §9, the daily reports check. Reword the posts gate sentence in the security rule.
- [x] Beads:
  - Claim `2o5.6`, and note the PR on it.
  - Note on `s3a.7`: the table name, and that photo columns are added to `trip_posts`.
  - Note on `s3a.15`: how to extend `reports`.
  - Note on `s3a.25`: the post and report surfaces are wired.
  - Follow-ups: clickable links in posts (`tripplanner-vh8`); restoring a taken-down post (`tripplanner-aob`, with `s3a.6`); the production hang (`tripplanner-tyl`).
- [ ] Sync with `main`; make sure the migration's timestamp sorts after every one there; open the PR; get CI green.

## Verification

- `pnpm test:db`, as anon, a stranger, a follower of a member, the organizer, two members and a moderator:
  - `trip_posts` returns 0 rows, from the table and from `get_trip_posts`, to anon, a stranger, a follower and a public-trip viewer, on private, unlisted and public trips;
  - members read posts newest first, with names across a block (Q5);
  - posts survive their author leaving; deleting a trip deletes its posts but keeps its reports;
  - direct INSERT, UPDATE and DELETE on both tables fail with 42501, and anon can't execute any of the RPCs;
  - every invalid input returns its status, writes nothing and doesn't use up the limit; the hourly, daily and report limits hold;
  - only the author deletes; nobody reports their own post, reports twice, or reports a post they can't see;
  - only the reporter and moderators can read a report;
  - `list_reports` returns nothing to non-moderators, and `decide_report` answers them `not_found`;
  - taking a post down hides it from members but not its author, and resolves every open report on it; dismissing leaves it up;
  - who, when and the outcome are recorded, and a decided report can't be decided again.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm check:secrets` and `pnpm build`; `pnpm test:e2e` against dev and against the production build.
- By hand at 360px with the seed users: a long unbroken note, both dialogs, 44px targets, and spoken names such as "Report Bob's note".
- CI green on the PR.

## Review

### Shipped

- **Migration** `20261103210000_trip_posts_and_reports.sql`. It was `…160000` until the expenses branch took that timestamp; it now sorts after every migration on `main` and in the sibling branches. It adds:
  - `trip_posts` and `reports` with their RLS, three enums, and two `private` helpers for multi-line text;
  - the RPCs `create_trip_post`, `delete_trip_post`, `get_trip_posts`, `report_trip_post`, `list_reports` and `decide_report`;
  - the rate-limit rules `post` (now 10 an hour), `post_daily` (30 a day) and `report` (10 an hour).
- **Library:** `lib/trip-posts.ts`, `lib/reports.ts`, `lib/post-fields.ts`, `lib/post-time.ts` and `lib/rpc-result.ts`; `app/_actions/trip-posts-actions.ts` and `app/_actions/reports-actions.ts`.
- **UI:**
  - On `/trips/[id]`, "Trip notes": the composer, the note cards, the delete and report dialogs, and paging to older notes.
  - `/admin/reports`, with the open reports and the last 20 decisions.
  - The moderator-only "Reports · N open" link on home.
- **Seed:** `founder@example.com`, a moderator in no trip, and two Lisbon notes.

### Evidence (2026-11-03, local stack, Next 16.2.4)

- `pnpm test:db`: 13 files, 243 tests. 109 are new: 53 in `012-trip-posts`, 56 in `013-reports`.
- `pnpm test`: 181 tests. 14 are new in `post-fields` and `post-time`; the 4 in `rpc-result` come with the shared file.
- `pnpm typecheck`, `pnpm lint` and `pnpm check:secrets` are clean. `supabase db lint` finds no errors. `pnpm build` succeeds.
- `pnpm test:e2e` (the smoke test and S6) passes against `pnpm dev` and against the production build.
- A throwaway Playwright script at 360px:
  - a 450-character note with no spaces and a long URL wraps inside its card, with no sideways scroll;
  - the trip page, both dialogs and `/admin/reports` have no tap target under 44px;
  - the delete dialog focuses "Keep it" first.

### Lenses

- **Architecture.** Writes are RPC-only and each charges its own limit after validating. Refusals are statuses, not exceptions. Moderator checks sit in RLS, in the RPCs and on the page. A report copies the text, so a decision survives the note being deleted. The shared RPC and Mailpit helpers match the sibling branches byte for byte, so no merge adds a second copy.
- **PM.** The founder answered §12 Q1 (post half) and D1–D4. S6 steps 5–6 and S6-N5 to S6-N9 check the answers.
- **UI/UX.**
  - Notes look like notes pinned to the trip: a dashed card edge, a signature in display type, and a mono line for handle and time. The author sees a "Taken down" stamp.
  - A refused note keeps its text, and screen readers hear each pinned note.
  - Dialogs put Cancel first.
- **Code review.** No database text reaches the UI. Ids are checked with `isUuid`. Note text renders as text, and the e2e posts markup to prove it. `/admin/reports` shows "Nothing here." to anyone who isn't a moderator.

### Notes

- **Production builds hang on Next 16.2.4 (`tripplanner-tyl`, P1).** On a trip with about 15 or more notes, "Pin to trip" saves the note, but the button stays on "Pinning…" and the note shows only after a reload. Any action that revalidates a page that large does the same, Remove member included.
  - **Cause:** the React canary inside Next 16.2.4 splits Flight rows over 3,200 bytes into lazy chunks, and the transition that renders them loses its wake-up.
  - **Ruled out:** Sentry, the Suspense boundary, link prefetch and the keyed composer.
  - **Fix:** Next 16.4.4 passes the posts e2e 3 of 3 with 25 notes, where 16.2.4 fails 3 of 3.
  - **CI:** the seed has 2 notes, so CI stays green until then. Upgrade before UAT invites go out; test plan S6-N9 checks it by hand.
- **Sentry:** note bodies and report notes are Server Action posts, so their text reaches Sentry request bodies until `tripplanner-7pl` lands.
- **Merging with the sibling branches.** Small conflicts are expected. Keep both sides, and regenerate the types the `project-supabase` way:
  - `app/trips/[id]/page.tsx`: both this branch and `2o5.1` add an import after `confirm-action`;
  - `database.types.ts`;
  - the top of this file;
  - test plan §12 Q1: the expense half, from `2o5.2`.

---

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
