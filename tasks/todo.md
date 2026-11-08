# tripplanner-2o5.5: expense, balance and mark-as-paid screens

**Bead:** [`tripplanner-2o5.5`](#) (epic [`tripplanner-2o5`](#); blocks `2o5.13`). **Test plan:** S4, S5 and S7 in [`docs/uat/uat-1-test-plan.md`](../docs/uat/uat-1-test-plan.md).

## Founder decisions (2026-11-08)

| # | Question | Answer |
|---|---|---|
| D1 | How do former members read in the money history? | Real name, marked "(left)", from a new members-only RPC, `get_trip_former_members`. |
| D2 | Where does the money sit on a trip page? | Above who's going. |

## Calls made without asking

- The UI says "cost", as the trip form already did. The test plan records the wording.
- A frozen cost hides Edit and Delete and says why, so S7-N5 now reads that way.
- Costs and payments show the newest five; the rest fold behind "Show N older".

## Done

- [x] `get_trip_former_members` with pgTAP (`016`), as anon, members, the person who left, a stranger and a follower.
- [x] `lib/trip-money.ts` and `lib/expense-fields.ts`, pure, with unit tests.
- [x] `TripMoney`, `ExpenseSheet`, `PaymentSheet`, `MoneySheet`; members only.
- [x] Leave, remove and delete refusals link to Settle up.
- [x] `e2e/money.spec.ts`: S4, S5 and S7 on phones, a 36-cost ledger, and a non-member on a public trip.

## Review

Proof: typecheck, lint, unit tests, `check:secrets`, `next build`, `supabase test db` and all seven e2e tests on a production build. Screens checked at 412 and 360 px; no horizontal overflow at 320 px.

Not in this chunk: home totals (S5 step 3) are `tripplanner-2o5.9`.

---

# tripplanner-2o5.6: text posts in a trip, Report, and the founder's reports page

**Bead:** [`tripplanner-2o5.6`](#) (epic [`tripplanner-2o5`](#); blocks `2o5.10`, `2o5.13`, `s3a.7`, `s3a.15`). **Test plan:** S6, PV6 and §12 Q1 in [`docs/uat/uat-1-test-plan.md`](../docs/uat/uat-1-test-plan.md). **Status:** the founder approved D1–D4 and the defaults on 2026-11-03. Built and proven on the local stack; [PR #8](https://github.com/eludden35/maya-travel-app/pull/8) is waiting for the founder to merge.

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
- **One migration,** `supabase/migrations/20261105201232_trip_posts_and_reports.sql`, with RLS in the same file:
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

- [x] Migration `20261105201232_trip_posts_and_reports.sql`: tables, RLS, grants, RPCs and rate-limit rules.
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
- [x] Seed: a moderator, `founder@example.com`, who isn't in any trip, and two sample notes in the Lisbon trip. Later, Alice's "Amalfi coast reunion" with Bob and 26 notes, so e2e keeps a large page under test.
- [x] Playwright `e2e/posts.spec.ts` (S6):
  - Bob posts a note containing `<b>hi</b> <script>alert(1)</script>`; it shows as text and no dialog opens.
  - Alice reports it. The founder takes it down with a note.
  - Bob sees it marked; Alice no longer sees it; Alice gets "Nothing here." on `/admin/reports`.
  - S6-N9: Bob pins a note on the 26-note Amalfi trip, then deletes it, so the trip stays at 26.
  - Sign-in reads codes with `e2e/support/mailpit.ts`, the same file as in `tripplanner-2o5.1`'s branch, which `e2e/smoke.spec.ts` now imports. `signIn` in `e2e/support/sign-in.ts` deletes the persona's older emails first, because the seed accounts get a new code every run.
- [x] Test plan: answer §12 Q1 (post half); in S6, the route and the decisions; in S6-N5, the limits; in PV6, add `reports`; in §9, the daily reports check. Reword the posts gate sentence in the security rule.
- [x] Beads:
  - Claim `2o5.6`, and note the PR on it.
  - Note on `s3a.7`: the table name, and that photo columns are added to `trip_posts`.
  - Note on `s3a.15`: how to extend `reports`.
  - Note on `s3a.25`: the post and report surfaces are wired.
  - Follow-ups: clickable links in posts (`tripplanner-vh8`); restoring a taken-down post (`tripplanner-aob`, with `s3a.6`); the production hang (`tripplanner-tyl`).
- [x] Sync with `main` (nothing new); the migration's timestamp sorts after every one there and in the sibling branches; open the PR: [#8](https://github.com/eludden35/maya-travel-app/pull/8).

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

- **Migration** `20261105201232_trip_posts_and_reports.sql`. It started as `…20261103160000`, which the expenses branch also used, then became `…20261103210000`. It was re-dated again after #10's `20261105120000` merged, because CI's `supabase db push` refuses a migration older than UAT's newest. It adds:
  - `trip_posts` and `reports` with their RLS, three enums, and two `private` helpers for multi-line text;
  - the RPCs `create_trip_post`, `delete_trip_post`, `get_trip_posts`, `report_trip_post`, `list_reports` and `decide_report`;
  - the rate-limit rules `post` (now 10 an hour), `post_daily` (30 a day) and `report` (10 an hour).
- **Library:** `lib/trip-posts.ts`, `lib/reports.ts`, `lib/post-fields.ts`, `lib/post-time.ts` and `lib/rpc-result.ts`; `app/_actions/trip-posts-actions.ts` and `app/_actions/reports-actions.ts`.
- **UI:**
  - On `/trips/[id]`, "Trip notes": the composer, the note cards, the delete and report dialogs, and paging to older notes.
  - `/admin/reports`, with the open reports and the last 20 decisions.
  - The moderator-only "Reports · N open" link on home.
- **Seed:** `founder@example.com`, a moderator in no trip; two Lisbon notes; and Alice's "Amalfi coast reunion" (`cccccccc-…`) with Bob and 26 notes.

### Evidence (2026-11-03, local stack, Next 16.2.4)

- `pnpm test:db`: 13 files, 243 tests. 109 are new: 53 in `012-trip-posts`, 56 in `013-reports`.
- `pnpm test`: 181 tests. 14 are new in `post-fields` and `post-time`; the 4 in `rpc-result` come with the shared file.
- `pnpm typecheck`, `pnpm lint` and `pnpm check:secrets` are clean. `supabase db lint` finds no errors. `pnpm build` succeeds.
- `pnpm test:e2e` (the smoke test and S6) passes against `pnpm dev` and against the production build.
- **After syncing with `main` at `9afcb3b`** (#9's Next 16.4.5 and #10's invite chaining), on 2026-11-05:
  - `pnpm test:db`: 16 files, 517 tests.
  - `pnpm test`: 221 tests.
  - `pnpm typecheck`, `pnpm lint` and `pnpm check:secrets` are clean, and the generated types match `database.types.ts`.
  - `pnpm test:e2e` against the production build: smoke, invites, S6 and S6-N9 pass, 3 runs out of 3.
  - S6-N9 on a temporary Next 16.2.4 install fails: the pinned note never appears, though it's saved.
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

- **Production builds hang on Next 16.2.4 (`tripplanner-tyl`, P1).** "Pin to trip" saves the note, but the button stays on "Pinning…" and the note shows only after a reload. Reporting sticks on "Sending…" the same way, and so does any action that revalidates the page, Remove member included. On this machine it takes about 15 notes; on CI's slower runner it takes 2.
  - **Cause:** the React canary inside Next 16.2.4 splits Flight rows over 3,200 bytes into lazy chunks, and the transition that renders them loses its wake-up.
  - **Ruled out:** Sentry, the Suspense boundary, link prefetch and the keyed composer.
  - **Fix:** Next 16.4.4 passes the posts e2e 3 of 3 with 25 notes, where 16.2.4 fails 3 of 3. PR #9 moved `main` to 16.4.5 on 2026-11-05, and S6-N9 now covers a 26-note page in CI.
  - **CI hits it too.** In run 41685685082 on `5fe9d3a`, the report hung with 2 notes, and the retry's post hung with 3. The server answered both in under 260 ms, and the browser logged no errors. A slower CPU makes it likelier, so phones on 16.2.4 would hit it too. Test plan S6-N9 still checks it by hand.
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

---

# tripplanner-2o5.2: expenses data layer

**Bead:** `tripplanner-2o5.2` (epic `tripplanner-2o5`; blocks `2o5.3` and `2o5.5`). **Test plan:** S4, E3, PV6 and §12 Q1 in [`docs/uat/uat-1-test-plan.md`](../docs/uat/uat-1-test-plan.md). **Builds on:** `lib/money.ts` (`2o5.4`, PR #2; one currency list in PR #4) and the trip RPCs (`718`, PR #3).

## Goal

A trip member records a shared cost (what it was, who paid, how much), split equally or exactly between members, then edits or deletes it. Every write goes through an RPC that checks the whole expense in one transaction. Nobody outside the trip can read an amount, whatever the trip's visibility or their ties to its members. No screens (`2o5.5`); no settlements, balances or leave rule (`2o5.3`).

## Founder decisions

Decided on 2026-11-03: the founder took every recommendation, and the defaults below.

| # | Question | Decision | Alternatives not taken |
|---|---|---|---|
| D1 | §12 Q1, expense half: who can edit or delete an expense? | The payer, the member who added it, or the organizer. Other members see it but can't change it. | Payer only; organizer only; payer or organizer; any member. |
| D2 | Soft or hard delete? | Soft. A deleted expense disappears for every member and stops counting, but the row stays, with who deleted it and when, so the founder can audit or restore it during UAT. Settlements are append-only for the same reason. | Hard: the row and its shares are gone. Simpler: no "not deleted" filter in RLS or in `2o5.3`'s balances. |
| D3 | Should shares key on a participant id that could later be a guest (`tripplanner-iha`)? | Yes, without a new table. The payer and share columns are neutral ids (`payer_id`, `member_id`) that hold a member's profile id. When guests arrive, `iha` adds a participant list and repoints the foreign keys in one migration; the data, RPC signatures and `lib/` types stay. | A participant table now (more moving parts for a post-UAT feature), or `profile_id` columns (a rename later). |

## Defaults (accepted with the decisions)

- **Any member can add an expense** and say which member paid.
- **Limits:** a description is required: one line, up to 120 characters. Amounts run from 0.01 to 999,999,999.99 (`MAX_AMOUNT_MINOR`); shares from 0. Zero shares are stored, so "in the split, owes nothing" stays visible (S4-N2).
- **The server computes equal splits** with `splitEqual`'s rule (§12 Q2); the client sends only who's in the split. Exact shares must add up to the amount; nothing is rounded.
- **One currency per trip by construction.** Expenses have no currency column: amounts are minor units of `trips.currency`. A trigger refuses to change a trip's currency once it has an expense, so a later currency picker can't re-denominate amounts.
- **An expense freezes when someone on it leaves.** If the payer or anyone in the split has left the trip, the expense can't be edited or deleted (`member_left`). Otherwise the change would move the balance of someone who left settled, and the remaining balances would stop summing to zero (S5-N2).
- **Rate limit:** one new surface, `expense_write`, 120 an hour, shared by create, edit and delete.
- **anon has no privileges on the money tables**, so its read is refused outright, which is stricter than 0 rows.

## Design

**Tables** (one new migration; RLS in the same file):

- `expenses`: `id`, `trip_id` (→ `trips`, **on delete cascade**, so `delete_trip` keeps working), `payer_id` (→ `profiles`, on delete restrict), `description`, `amount bigint` (1 to `MAX_AMOUNT_MINOR`), `split` (`equal` | `exact`), `created_by`, `created_at`, `updated_by`, `updated_at`; with a soft delete (D2), also `deleted_by` and `deleted_at`.
- `expense_shares`: primary key `(expense_id, member_id)`; `member_id` → `profiles`, on delete restrict; `trip_id`; `amount bigint` (0 to the maximum). The foreign key `(expense_id, trip_id)` → `expenses (id, trip_id)`, on delete cascade, keeps each share in its expense's trip and lets its policy check membership directly.
- **Shares always add up.** A deferred constraint trigger checks at commit that every expense's shares sum to its amount, so neither a buggy RPC nor a hand-written SQL fix can break it.

**Reads:** SELECT for `authenticated` only, through the policy `private.is_trip_member(trip_id)` (plus "not deleted" with D2 soft). No branch looks at `trips.visibility`, follows, shared trips or blocks. Neither `anon` nor `authenticated` gets an INSERT, UPDATE or DELETE privilege or policy.

**Writes** follow the `718` pattern: `security definer`, `search_path = ''`, identity from `auth.uid()` only, a status instead of an exception, validation before `consume_rate_limit('expense_write')`, and `revoke … from public, anon`.

| RPC | Statuses |
|---|---|
| `create_expense(trip_id, payer_id, description, amount, split, member_ids, amounts)` → `(status, expense_id)` | `ok`, `unauthorized`, `not_found`, `invalid_description`, `invalid_amount`, `invalid_shares`, `not_a_member`, `shares_mismatch`, `rate_limited` |
| `update_expense(expense_id, payer_id, description, amount, split, member_ids, amounts)` | the same, plus `forbidden` (D1) and `member_left` |
| `delete_expense(expense_id)` | `ok`, `unauthorized`, `not_found`, `forbidden`, `member_left`, `rate_limited` |

- **Equal:** send `member_ids` only. The server computes the shares with `private.equal_shares(amount, member_ids, payer_id)`: `amount / n` each, then the leftover cents one each to the payer first and the others by ascending id (`order by member_id = payer_id desc, member_id`). **Exact:** `amounts[i]` is `member_ids[i]`'s share.
- A caller outside the trip gets `not_found`, the same as for an expense that doesn't exist or was deleted.
- **Locking** (from the `718` hand-over): each RPC takes the trip row `for share` and, in id order, the `trip_members` rows of everyone on the old and new expense `for share`. Edit and delete also lock the expense row. So no expense can land on someone between the leave or remove check and its delete, or on a trip that is being deleted.

**`lib/`:**

- `lib/expenses.ts` (server-only):
  - `listTripExpenses(tripId)` and `getExpense(id)` throw `DataAccessError` when a read fails.
  - `createExpense`, `updateExpense` and `deleteExpense` return result unions.
  - Shares come back as `lib/money` `Share`s.
  - Ids and integer amounts are checked before the call, so a malformed value gets a typed error rather than `unknown`.
- The status-to-result mapping moves to a small shared `lib/rpc-result.ts`. `lib/trips.ts` keeps its own copy until the parallel chunks merge.
- Server Actions and their copy belong to the screens (`2o5.5`).

## Plan

- [x] Migration `supabase/migrations/20261103160000_expenses.sql`: the enum, both tables, indexes, RLS, the sum and currency triggers, `private.equal_shares`, the three RPCs and the `expense_write` rule.
- [x] pgTAP: `supabase/tests/database/011-expenses.test.sql`.
- [x] Regenerate `database.types.ts` locally and splice in only the new hunks.
- [x] `lib/expenses.ts`, `lib/rpc-result.ts` and `EXPENSE_WRITE` in `lib/rate-limit.ts`, with Vitest, including the equal-split parity fixture.
- [x] Test plan: answer §12 Q1 (the expense half) and add the matching checks (S4-N5, S4-N6, S7-N5).
- [x] Hand-over notes on `2o5.3` and `2o5.5`, and a note on `2o5.2` linking the PR.
- [ ] Sync with `main`, check the migration timestamp sorts last, open the PR and get CI green: [PR #6](https://github.com/eludden35/maya-travel-app/pull/6) is open; close `2o5.2` when it merges.

## Verification

- `pnpm test:db` (`011-expenses`), run as anon, the organizer, two members and several outsiders:
  - **Money-privacy matrix:** a private, an unlisted and a public trip each hold expenses. On each, these read 0 rows from `expenses` and `expense_shares`:
    - a stranger;
    - a follower of the organizer and of a member;
    - a viewer who can open the trip;
    - a member of another trip with the same people.

    anon's read is refused. As the control, each trip's members read every row.
  - A member who leaves reads 0 rows afterwards. A blocked member still reads the blocker's expenses (§12 Q5).
  - Direct INSERT, UPDATE and DELETE on both tables fail with 42501, and anon has no EXECUTE on the RPCs.
  - **S4 in SQL:**
    - $100.00 split three ways gives 33.34 / 33.33 / 33.33, with the odd cent on the payer, both times.
    - $0.02 split three ways follows the same rule.
    - Exact splits $10.00 short and $10.00 over are refused; 30 / 30 / 30 is saved.
    - Editing to $120.00 gives 40.00 each; delete works.
  - On fixed ids, `private.equal_shares` gives the same shares as `splitEqual` on the same fixture in Vitest.
  - Each bad input returns its status, writes nothing and charges nothing.
  - Non-member callers get `not_found`, members outside D1 get `forbidden`, and an expense whose member left gets `member_left`.
  - The sum trigger refuses shares that don't add up, the currency trigger refuses a change once an expense exists, and `delete_trip` removes a trip's expenses and shares.
  - Writes past the limit get `rate_limited`.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm check:secrets`, `pnpm build`, `pnpm test:e2e` and `supabase db lint`.
- CI green on the PR.

## Review

### Shipped

- **Migration** `20261103160000_expenses.sql`:
  - the `expense_split` enum and the `expenses` and `expense_shares` tables, with members-only SELECT policies and no client writes;
  - `create_expense`, `update_expense` and `delete_expense`, with the `expense_write` rate limit (120 an hour);
  - `private.equal_shares`, the server's equal split;
  - a deferred constraint trigger that keeps every expense's shares equal to its amount, and a trigger that fixes a trip's currency once it has an expense.
- **Library:** `lib/expenses.ts` (reads, writes, result unions), `lib/rpc-result.ts` (status mapping) and `EXPENSE_WRITE` in `lib/rate-limit.ts`.
- **Types:** the new tables, enum and functions spliced into `database.types.ts`.
- **Test plan:** the expense half of §12 Q1, plus checks S4-N5, S4-N6 and S7-N5.

### Evidence (2026-11-03, local stack)

- `pnpm test:db`: 12 files, 274 tests, 140 of them new in `011-expenses`. Re-run after the last migration edit.
- **Mutation checks.** Six broken copies of the rules each fail the tests that guard them:

  | Mutation | Tests that fail |
  |---|---|
  | Expenses readable on any public trip | 5: the four outsiders on the public trip, and the "no money policy looks at visibility" check |
  | Shares readable by one follower | 3: that follower on each of the three trips |
  | Leftover cents by id only, ignoring the payer | 2: fixtures 1 and 5 |
  | No sum trigger | 1: "the database refuses shares that do not add up" |
  | Any member may edit or delete | 12 |
  | Expenses never freeze | 3: edit, delete and "a frozen expense is unchanged" |

- `pnpm test`: 182 tests, 19 of them new (the equal-split fixture, the input pre-check, row mapping and status mapping).
- `pnpm typecheck`, `pnpm lint`, `pnpm check:secrets` and `pnpm build` are clean. `supabase db lint` (public, private) finds no errors.
- **Types:** the local generator's output matches the spliced `database.types.ts`, apart from the two differences the `project-supabase` skill describes (the `PostgrestVersion` block and the helper generics).
- **Privileges, read from the catalog:**
  - anon has no privilege on either table and can't call the RPCs;
  - `authenticated` can SELECT both tables and call the three RPCs;
  - the private helpers are owner-only, except `is_live_expense`, which the shares policy needs.
- `pnpm test:e2e` passes against `pnpm dev`.

### Lenses

- **Architecture.**
  - Writes are RPC-only, and the database keeps the two money invariants (shares add up; the currency is fixed once a trip has an expense) whoever writes.
  - Locks are taken trip row, then expense row, then member rows in id order, so expense RPCs serialize with `leave_trip`, `remove_trip_member` and `delete_trip`.
  - `payer_id` and `member_id` leave room for guest participants (`iha`).
- **PM.** The founder answered §12 Q1 for expenses and took every default. S4-N5, S4-N6 and S7-N5 check the answers.
- **UI/UX.** There is no UI in this chunk. Each status the screens must explain is a distinct, user-fixable reason. The hand-over lists the copy `2o5.5` needs.
- **Code review.**
  - No database text reaches a caller.
  - Ids are checked with `isUuid`, and amounts must be safe integers before the call.
  - The money-privacy matrix covers four kinds of outsider and is mutation-tested.

### Notes

- **Concurrency is reasoned, not tested.** pgTAP runs in one session, so the locking order is argued in the migration header.
- **anon:** its read is refused rather than answered with 0 rows. That is stricter than the Bead's wording.
- **Status mapping:** `lib/trips.ts` keeps its own copy of the mapping in `lib/rpc-result.ts`. Switching it over is a two-line change once the parallel chunks have merged.
- **Migration order:** if a sibling chunk's migration merges first with a later timestamp, rename this one so it still sorts last.
- **Shared stack:** a sibling's lock reached 30 minutes at 10:45, and this session removed it under the shared-stack rule.

### Follow-ups

- `tripplanner-2o5.3`:
  - balances count expenses where `deleted_at is null`;
  - reuse `private.lock_trip_members` for the settlement RPCs;
  - refuse voiding a settlement whose party has left.
- `tripplanner-2o5.5`:
  - copy for each status;
  - a label or names RPC for former members, who are missing from `get_trip_members`.

---

# tripplanner-2o5.1: trip invite links (`trip_invites`, `accept_trip_invite`, `/join/[token]`)

**Bead:** `tripplanner-2o5.1` (epic `tripplanner-2o5`; blocks `2o5.9` and `2o5.13`). **Test plan:** S2 steps 3–4, S3, S7 step 6, PV2, PV6 and §12 Q6 in [`docs/uat/uat-1-test-plan.md`](../docs/uat/uat-1-test-plan.md). **Status (2026-11-03):** built and verified locally; [PR #7](https://github.com/eludden35/maya-travel-app/pull/7) is open for the founder to merge, and the Bead stays in progress until then. The founder accepted every recommended answer below on 2026-11-03.

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
- [x] Proof (see Evidence), then [PR #7](https://github.com/eludden35/maya-travel-app/pull/7) and a note on the Bead linking it.
- [ ] CI green and the founder merges; then close the Bead.

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
  - `lib/trip-invites.ts`: result unions; it reuses `toResult` and `toFailure` from `lib/rpc-result.ts`, which `2o5.2` added.
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
- **After merging `main` with `2o5.2`'s expenses (2026-11-03):**
  - `pnpm test:db` passes 13 files and 377 tests, three of them new money checks in `011-trip-invites`.
  - `pnpm test` passes 207 tests.
  - `pnpm typecheck`, `pnpm lint` and `pnpm check:secrets` are clean.
  - `pnpm test:e2e` passes on the production build and twice on a running `pnpm dev`. On a dev server that Playwright started cold, both specs timed out after "Create trip" while `/trips/[id]` compiled.
  - Types generated from the reset database match `database.types.ts`, apart from the PostgrestVersion block and the generator's parentheses.

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
- **The AC's "no money rows visible before joining"** is asserted since the sync with `2o5.2` (2026-11-03): someone holding a live link sees no expense or share rows, and after joining sees them like any member. pgTAP also asserts that joining adds exactly one `member` row and changes nothing else.
- **Residual exposure:** the first request line, `GET /join/<token>`, is in the host's access log, as with any link-based invite.
- **Sign-in copy:** the code step shows "carry on with your invite" whenever the cookie exists, even for a dead link. The link page has already said it no longer works.
- **For `2o5.9`:** a pending invite can be the `jtsn_invite` cookie on this device, before it's accepted. `readInviteToken` plus `getTripInvitePreview` give the trip.

### Follow-ups

- `tripplanner-7pl` (P1, blocks `2o5.13`, entry criterion E4): Sentry collected client IPs and request bodies (emails, sign-in codes) by default. At the founder's request it's fixed in the same PR; see its section below.
- `tripplanner-x6a` (P2, founder decision): whether links made by invite-admitted accounts can admit new accounts.

---

# tripplanner-7pl: no IP address or email address in Sentry events (UAT entry E4)

**Bead:** `tripplanner-7pl` (P1; blocks `2o5.13`). **Test plan:** E4. **Status (2026-11-03):** fixed in [PR #7](https://github.com/eludden35/maya-travel-app/pull/7) alongside `2o5.1`, at the founder's request; close the Bead when it merges. Two settings in Sentry itself are founder steps.

## Goal

No Sentry event, from the browser or the server, carries an email address or an IP address. SDK 11 ignores `sendDefaultPii`. Its `dataCollection` defaults sent the client IP, every request header, Server Action form bodies (email addresses, sign-in codes, trip notes), query strings and the server's host name.

## Shipped

- **`lib/sentry-options.ts`**, shared by the browser, server and edge runtimes:
  - `userInfo: false`: no `user.ip_address`, Sentry's IP headers are dropped, and the browser SDK sends `infer_ip: "never"`, so Sentry doesn't take the IP from the connection;
  - request headers: only `user-agent` and `x-vercel-id`; no response headers;
  - no request or response bodies, cookies, query strings or local variables;
  - `includeServerName: false`;
  - `beforeSend` and `beforeBreadcrumb` also replace email addresses, typed or URL-encoded, with `[email]`.
- **`AGENTS.md`:** the Sentry line no longer leans on `sendDefaultPii`.

## Founder steps (in Sentry, not code)

In Project Settings → Security & Privacy:

1. Turn on **Prevent Storing of IP Addresses**. The browser SDK already asks Sentry not to infer an IP; this makes it a setting rather than a request.
2. Leave **Data Scrubber** and **Use Default Scrubbers** on.
3. Under **Advanced Data Scrubbing**, add `[Replace] [Email Addresses] from [$string]`, a server-side backstop for the code's scrubber.

Then run E4 on UAT.

## Evidence (2026-11-03)

- **Vitest:** the test starts the SDK the way `sentry.server.config.ts` does and sends a sign-in form post through a real HTTP server, piped the way Next.js reads a Server Action. The envelope has no email address, IP address, location, cookie, body, query string or server name. Undoing each part fails it:
  - the old settings fail on the client IP;
  - bodies back on fail on the sign-in code;
  - the email scrubber off fails on the address.
- **The local app, both runtimes:** `pnpm dev` behind a stand-in for Vercel's edge, which adds `x-forwarded-for`, `x-real-ip`, `x-vercel-forwarded-for` and the location headers, and for Sentry's ingest.
  - A browser error and a server error, each with an email address in the message, the URL, a cookie and a form body.
  - The 7 envelopes held no email address, IP address, city, coordinates, cookie, body or query string, and the browser event carried `infer_ip: "never"`.
  - That run found that the server's `referer` header keeps the previous page's query string, so it's no longer kept.

---

# tripplanner-x6a: only links made by allow-listed accounts let new accounts in

**Bead:** `tripplanner-x6a` (P2 decision; epic `tripplanner-2o5`). **Test plan:** §12 Q11 and S3-N7 in [`docs/uat/uat-1-test-plan.md`](../docs/uat/uat-1-test-plan.md). **Status (2026-11-05):** built and verified locally; the PR is open for the founder to merge, and the Bead stays open until then.

## Founder decision (2026-11-05)

"Allow-listed links only." A live link lets someone whose email isn't on the allow-list finish onboarding only when the account that made it (`trip_invites.created_by`) has an allow-listed email: a full email, its @domain or `*`. The check runs each time the link is used, so allow-list edits apply to existing links at once. No new column.

Unchanged:

- An allow-listed email onboards with or without a link.
- A live link still joins its trip during onboarding, whoever made it, so an allow-listed newcomer holding a link from an organizer who isn't allow-listed still joins.
- Someone who already has a profile joins through `accept_trip_invite`, whoever made the link.
- A refused attempt writes nothing: no profile, ToS row, membership or use, and no rate-limit charge.

## Design

- **Migration** `20261105120000_invite_links_from_allowlisted.sql`. PR #8's migration was later re-dated to `20261105201232`, so it now runs after this one:
  - `private.account_is_allowlisted(uuid)`: an account's `auth.users` email through `private.email_is_allowlisted`; revoked from `public`, `anon` and `authenticated`;
  - `can_complete_onboarding(text)` and `complete_onboarding(text ×6)` replaced in place, with the same signatures and statuses. The new refusal comes before every write and before the rate-limit charge;
  - `can_invite_new_accounts()`: no argument, so it answers only about the caller; `authenticated` and `service_role` only.
- **Onboarding** (`app/onboarding/handle/page.tsx`): when onboarding is refused, a live link (the preview answers) gets "This link can't add new accounts" with what to do: ask the founder to add their email, then open the link again. Dead links and no link keep their answers.
- **Organizer panel** (`invite-panel.tsx`): "Your links only work for people who already have an account." when `can_invite_new_accounts()` is false. The trip page asks only for the organizer.

## Plan

- [x] Branch from `main` at `645c915`.
- [x] Migration: the helper, the two replaced functions and `can_invite_new_accounts`.
- [x] pgTAP `014-invite-chaining.test.sql`: the six cases the review asked for.
- [x] `canInviteNewAccounts` in `lib/trip-invites.ts`, the trip page, the panel line and the onboarding screen.
- [x] `database.types.ts`, test plan §12 Q11 and S3-N7.
- [x] Proof (see Review), then the PR and a note on the Bead.
- [ ] CI green and the founder merges; then close the Bead.

## Review

### Evidence (2026-11-05, local stack, after `supabase db reset`)

- **`supabase test db`: 14 files, 408 tests.** `014-invite-chaining` adds 31; `011-trip-invites` passes unchanged.
- **Deliberate regressions fail the new tests,** each run in a rolled-back transaction:
  - the creator check left out of `complete_onboarding` fails 11;
  - the creator check left out of `can_complete_onboarding` fails 2;
  - charging the rate limit before the refusal fails the "writes nothing" check.
- **Other checks:** `pnpm test` (207), `pnpm typecheck`, `pnpm lint`, `pnpm check:secrets` and `pnpm build` are clean.
- **Types:** generated from the reset database, they match `database.types.ts`, including the new `can_invite_new_accounts` line, apart from the PostgrestVersion block and the generator's parentheses.
- **`pnpm test:e2e` on the production build:** both specs pass, unchanged. `invite-join`'s friend (`@example.org`, not listed) still onboards through the organizer's link: the organizer is `@example.com`, which the seed lists.
- **A one-off Playwright run on the production build** (not committed):
  - an allow-listed organizer's link lets a friend in, and the friend makes a trip and a link of their own;
  - the friend's panel shows the new line, with no link and with a live one;
  - a newcomer who isn't listed, opening the friend's link, gets "This link can't add new accounts." with their email;
  - someone who already has an account joins with the friend's link;
  - at 375px and 360px nothing scrolls sideways, and "Use a different email" is 48px tall.

### Notes

- **Copy:** the newcomer is told to ask Jettison's founder, not "the person who invited you", because only the founder edits the allow-list. The panel line follows the founder's wording. Allow-listed newcomers can still use these links, but saying so would add a second line.

---

# tripplanner-tyl: Next.js 16.4.5, so pages update after a Server Action in production builds

**Bead:** `tripplanner-tyl` (P1, found in `2o5.6`). **Status (2026-11-05):** [PR #9](https://github.com/eludden35/maya-travel-app/pull/9) open for the founder to merge. The Bead stays open until it merges.

## Goal

On Next 16.2.4, a production build sometimes never updates the page after a Server Action that refreshes it. The server answers in well under a second, but the button stays on its pending label ("Sending…", "Pinning…", "Making link…") until a reload. 16.2.4 bundles React `19.3.0-canary-3f0b9e61-20260317`, whose client can lose the wake-up for that transition. 16.4.4 and 16.4.5 bundle `19.3.0-canary-278794d7-20261002`. A slower CPU hits it on small pages too, so testers' phones would.

## Changed

- **`next` and `eslint-config-next`:** 16.2.4 → 16.4.5. The lockfile moves `@next/env`, `@next/eslint-plugin-next` and the `@next/swc-*` binaries with them.
  - The proof was first run on 16.4.4.
  - 16.4.5 (2026-11-03) is 16.4.4 plus seven security fixes. None of them reaches this app today:
    - four are for `'use cache'`, which isn't on;
    - one is for route handlers that forward a fetched body;
    - one is for image optimization, and the app has no `next/image`;
    - one is for Edge routes, and there are none.
  - Of the files 16.4.5 changes, the page runtime only changes Vercel's minimal mode for placeholder params, and the proxy adapter's cookie change skips the proxy.
- **`next.config.ts`:** `agentRules: false`. Since 16.3, `next dev` writes its own block into `AGENTS.md` whenever it detects a coding agent (Claude Code, Cursor, Codex and others), which would dirty the tree in every agent session.
- **`AGENTS.md`:** the web-framework line points agents at the docs bundled with the installed version (`node_modules/next/dist/docs/`). That's what Next's block would have said.

## Release notes (16.3, 16.4) against what this app uses

- **`proxy.ts`:** same matcher source, still on the Node.js runtime. 16.4.4 compiles it to also match the `.rsc` and segment-prefetch forms of the same paths. Static assets stay excluded.
- **Security headers and CSP:** identical in the 16.2.4, 16.4.4 and 16.4.5 builds on every route checked: `/`, sign-in, a redirect, a legal page, an icon, the manifest, `robots.txt`, a CSS file and a 404. Only the hashed font names in the preload `Link` header differ. The 16.3 and 16.4 CSP fixes are for nonce-based policies, and ours allows inline scripts.
- **Server Actions:** 16.3 fixed a navigation that was reverted, or stuck forever, while a Server Action was in flight. Client-handled action redirects now answer 200 instead of 303. The e2e covers follow, sign-in, onboarding, create, edit and delete trip, and creating, replacing, turning off and joining by an invite link.
- **`next/font/google`:** still self-hosted. Both builds have 19 `@font-face` rules and 16 `.woff2` files under `/_next/static/media`, so `font-src 'self'` holds.
- **`@sentry/nextjs` 11.10.0:** its peer range is `^16.0.0-0`, and Sentry's own e2e apps ran on 16.4.1 and 16.4.2 by 11.9 and 11.10. The build with `withSentryConfig` passes with no warning.
- **`next build`** now type-checks with the TypeScript CLI over everything `tsconfig.json` includes, e2e specs too. `pnpm typecheck` already does that in CI.

## Evidence (2026-11-04 and 2026-11-05)

- **Checks** after merging `main` with PR #7, on 16.4.4 and again on 16.4.5: `pnpm typecheck`, `pnpm lint`, `pnpm test` (207 tests), `pnpm check:secrets`, `pnpm build` and `pnpm test:db` (13 files, 377 tests) pass.
- **CI on PR #9 with 16.4.4:** every job passed, including pgTAP, e2e and the Vercel preview.
- **E2E on production builds, `main`'s two specs (smoke and invite-join):**
  - Every version was built from the same `main` (`645c915`) and served with `next start`, each batch starting from a fresh `supabase db reset`.
  - The CPU was slowed with CDP `Emulation.setCPUThrottlingRate` on every page, the friend's and the stranger's phones too.
  - No retries, and 15-second waits, so a slow step isn't mistaken for a hang. One test is one spec run.

  | | Unthrottled | 4× | 6× | 10× | 20× |
  | --- | --- | --- | --- | --- | --- |
  | Next 16.4.5 | 10/10 | 20/20 | 20/20 | 20/20 | 40/40 |
  | Next 16.4.4 | 10/10 | 20/20 | 20/20 | 20/20 | 40/40 |
  | Next 16.2.4 | 10/10 | 20/20 | 20/20 | 19/20 | 39/40 |

- **Both 16.2.4 failures are the hang,** on the organizer's invite panel:
  - at 10×, "Create invite link" got a 200 in 69 ms (11 KB, `x-action-revalidated: 1`), and the button stayed on "Making link…";
  - at 20×, "Turn off link" got a 200 in 139 ms (12 KB), and the button stayed on "Turning off…".
- **The throttle held:** a fixed loop timed on the page at the end of each test took about 12 ms unthrottled, 50 ms at 4×, 75 ms at 6×, 125 ms at 10× and 250 ms at 20×, the same on every version.
- **No CSP violation, console error or page error** in any of the 300 throttled runs.
- **`next dev` and `AGENTS.md`:** started from Claude Code (`CLAUDECODE=1`), it left `AGENTS.md` untouched. A copy without `agentRules: false` printed "Generated AGENTS.md for AI agents" and appended its block.
- **CI's own command,** `CI=1 pnpm test:e2e`: 2 of 2 pass on 16.4.4 and on 16.4.5.
- **PR #8's posts e2e (2026-11-03, on the Bead):** at 4× and 6×, 16.2.4 passed 1 of 6 and 16.4.4 passed 6 of 6.

## Follow-ups

- **Two copies of `sharp`:** Next 16.4 brings `sharp` 0.35.5 as an optional dependency, next to the app's 0.34.5 for `lib/images.ts`, which no route uses yet. Moving the app to 0.35 would drop one copy, but it touches the EXIF-strip path, so it's a change of its own.
- **Large-page coverage (from the Bead):** a seed trip with 25 or more notes, and an e2e that posts there, need PR #8's notes. #8's posts e2e can cover it once #8 is rebased onto this.

---

# tripplanner-2o5.3: settlements, balances and the balance rule for leaving

**Bead:** `tripplanner-2o5.3` (P1, epic `tripplanner-2o5`). **Status (2026-11-08):** PR open for the founder to merge. The Bead stays `in_progress` until it merges.

## Goal

Testers can add costs but can't see who owes whom or mark a debt as paid. This chunk adds the settlement ledger, each member's net balance, and the rule that nobody leaves, is removed from, or deletes a trip with money outstanding. The screens are `tripplanner-2o5.5`.

## Founder decisions (test plan section 12, Q3)

- Either party records a settlement, and either party voids one. Nobody else in the trip can, the organizer included.
- No confirmation: it counts as soon as it's recorded.
- Any amount from 0.01 to the maximum, so partial payments and overpayments record as entered.
- `trip_balances` returns one net amount per member. `simplifyDebts` was already in `lib/money.ts` (`2o5.4`), so suggested payments needed no new code.

## Changed

- **Migration** `20261108151603_settlements.sql`: the `settlements` table with member-only RLS, `record_settlement`, `void_settlement`, `trip_balances`, the `settlement_write` rate limit (60 an hour), and `private.trip_departure_blocker` redefined to return `unsettled_balance` for a nonzero net.
- **A void** is a new row: the same amount paid back the other way, with `reverses_id` on the settlement it reverses. A composite foreign key holds it to the original's trip, parties and amount; a unique key allows one void per settlement; a trigger refuses a void of a void.
- **Append-only** holds against everyone. Clients and the secret key have no UPDATE or DELETE, and a trigger refuses both for the owner and the security definer RPCs too. Rows go only by the cascade from a deleted trip.
- **Currency:** a trip with a settlement and no expenses can't change currency either. `private.trips_keep_currency_with_expenses()` now checks both tables.
- **`private.trip_nets`** is the one balance formula. It filters deleted expenses itself, because the owner bypasses RLS.
- **App:** `lib/settlements.ts` (types, reads, RPC wrappers for `2o5.5`), `unsettled_balance` in the three result unions in `lib/trips.ts`, `SETTLEMENT_WRITE` in `lib/rate-limit.ts`, and refusal copy with the actual amounts in `app/_actions/unsettled-balance-copy.ts`, as S7 step 1 expects. The Server Actions read the balances only after a refusal.
- **Existing pgTAP:** three assertions in `011-expenses` and `011-trip-invites` left or deleted a trip with money outstanding, which the rule now refuses, so those members settle up first.

## Evidence (2026-11-08)

- **Checks:** `supabase test db` from a clean reset (17 files, 680 tests, 160 of them new), `pnpm typecheck`, `pnpm lint`, `pnpm test` (241 tests), `pnpm build`, and all 4 e2e specs on the production build.
- **Money-privacy matrix** on private, unlisted and public trips: a stranger, a follower of two members, someone in another trip with the members, a viewer who can open the trip, and someone who left all read 0 settlements and 0 balances; anon is refused outright.
- **Races, on two real connections** (pgTAP is single-session). The second connection waited about 1.4s on the first's lock each time, then got the right status:

  | First connection, held open | Second connection | Result |
  | --- | --- | --- |
  | Void a settlement | Void it too | `already_voided`, one void row |
  | Record a payment | The payer leaves | `unsettled_balance` |
  | A party leaves at zero | Record a payment with them | `not_a_member` |
  | Record a payment | Delete the trip | `unsettled_balance` |
  | Void a payment | The payer leaves at zero | `unsettled_balance` |
  | A party leaves at zero | Void their payment | `member_left` |

- **Mutation pass:** 24 deliberate breakages, one at a time on the local database (no membership check, wrong sign, deleted expenses counted, append-only trigger dropped, policy opened to public trips, and so on). The suite caught all 24 and was green again after each was undone.
- **Signed-in smoke, production build, throwaway spec, seed accounts:** with a $90.00 expense split between Alice and Bob, the real dialogs said:
  - Bob, Leave: "You owe $45.00 on this trip. Settle up and mark it as paid, then you can leave."
  - Alice, Remove: "Bob Okafor owes $45.00 on this trip. Once they've settled up and it's marked as paid, you can remove them."
  - Alice, Delete: "Not everyone is settled up yet: you're owed $45.00 and Bob Okafor owes $45.00. Once every balance is settled and marked as paid, you can delete the trip."
  - Bob, after overpaying by $10.00: "You're owed $10.00 on this trip. Once you're paid back and it's marked as paid, you can leave."
  - After the overpayment was voided and $45.00 was recorded, Bob left and the trip was gone for them.

## Follow-ups

- **`tripplanner-2o5.5` (screens):** the hand-over is on the Bead. S5 and S7 through the real UI belong in that chunk's e2e, which is why the smoke above wasn't committed.
