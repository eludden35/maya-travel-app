# UAT-1 test plan: the core trip loop

- Date: 2026-10-29. Status: Draft. Owner and final sign-off: the founder.
- Round: the first user-acceptance test, with 5–25 invited friends and family over 2–3 weeks.

> **This plan tracks the spec, not the build.** As of 2026-10-29 only sign-in, handle onboarding, follow/block and the legal pages exist. The routes below (`/trips/new`, `/trips/[id]`, `/join/[token]`, `/settings`, `/[handle]`) and every money and post feature come from the Phase 2 spec in the approved UAT readiness plan of 2026-10-29. When a Phase 2 chunk ships behavior that differs from this plan, update the affected scenario in the same PR. Hard rules: [ADR 0002](../adr/0002-social-vision-pivot.md) section 5. Glossary: [`product-engineering.md`](../../app-context/product-engineering.md).

## 1. Scope

UAT-1 answers one question: can a real group run a trip's shared costs in Jettison, from first invite to settled, on their own phones, without anyone seeing money or posts that aren't theirs?

| In scope | Out of scope (later rounds) |
|---|---|
| Sign-in by email code or link; handle onboarding with 18+ and Terms acceptance | Photos and image uploads (the moderation queue and CSAM gates are still open) |
| Create, edit and delete a private trip; invite by link (share, join, revoke, rotate, expiry) | DMs and notifications |
| Expenses with equal and exact splits; edit; delete | Explore, public and unlisted trips in the UI, join requests |
| Balances, simplified debts, mark as paid, void | Real payments of any kind; money is settled outside the app |
| Text posts in a trip, members only; Report; founder review page | Guest participants (people without an account) |
| Leave a trip, remove a member, the zero-balance rule | Comments, reactions, feeds, avatars |
| `/settings`, `/[handle]`, block and unblock, deletion request | Native apps |

## 2. Personas

| ID | Persona | Who plays it | Notes |
|---|---|---|---|
| ORG | Trip organizer | A tester who creates a trip | Owns the trip and its invite links; can remove members |
| MEM | Invited member | A tester who joins from a link | Include at least one person new to Jettison and one returning user |
| OUT | Non-member | Any tester outside the trip | Three variants: **OUT-anon** (signed out), **OUT-signed-in** (a stranger), **OUT-follower** (follows ORG, not in the trip). A member who left or was removed is OUT too. |
| ADM | Founder acting as admin | The founder | Manages the allow-list, reviews reports, triages feedback, resets data, runs the formal device passes |

## 3. Environment

| Item | UAT-1 setting |
|---|---|
| URL | `https://uat.<domain>` (placeholder until the domain is bought), backed by the existing hosted Supabase project. Not indexed (`noindex`, `robots.txt`). |
| Access | Invite-only. Onboarding completes only for an allow-listed email or a valid trip invite link; anyone else sees the "invite-only" screen. Testers must be 18 or older (the Terms require it and onboarding asks). |
| Test-build notice | On the sign-in screen and at the top of the Terms (version bumped for UAT), using the copy in section 10. |
| Data reset | Reset once before testers arrive. No resets during the round except to recover from a P0 data problem, announced in the tester group chat at least 24 hours ahead when possible. At exit the founder decides whether UAT-1 data is wiped or carried into UAT-2, and tells testers either way. |
| Money | No real money moves through Jettison. Testers settle with each other however they normally would, then mark the debt as paid. The app never asks for card or bank details. |
| Email | Sign-in mail carries a 6-digit code and a link; the code expires in an hour. |

## 4. Devices and accessibility

| Platform | Browser | Assistive tech | Formal passes |
|---|---|---|---|
| iPhone, current iOS | Safari | VoiceOver | S1–S8, then S1–S5 again with VoiceOver |
| Android phone, current major version | Chrome | TalkBack | S1–S8, then S1–S5 again with TalkBack |
| Desktop (record which) | Chrome, Firefox or Safari | Keyboard only | S1–S8 |

Every formal pass also checks:

- [ ] At 360px wide nothing scrolls sideways, including long trip names, long posts and amounts like 1,000,000.00.
- [ ] Every tap target is at least 44×44 CSS px, including Block, Report, Leave and Mark as paid.
- [ ] Every control has a spoken name that says what it does ("Mark $14.00 to A as paid", not "Button"), and errors and confirmations are announced.
- [ ] Balance direction is in words ("you owe", "owes you"), never color alone; focus is visible on desktop; with Reduce Motion on, state changes still show.

Testers' own phones give exploratory coverage; only the founder's formal passes count toward the exit criteria. Record them in the run log (section 11).

## 5. Entry criteria

Testers are invited only when every row is checked.

| # | Criterion | How to check |
|---|---|---|
| E1 | P0 and P1 review findings 1–8 closed | Each finding's Bead is closed and has a pgTAP test that failed before the fix |
| E2 | CI green | The latest `main` run passes typecheck, lint, Vitest, `supabase test db` and the Playwright mobile smoke test |
| E3 | pgTAP green, including the money-privacy matrix | `supabase test db` passes; the matrix shows non-members, followers and public-trip viewers get 0 rows from `expenses`, `expense_shares` and `settlements` on private, unlisted and public trips |
| E4 | Sentry receives errors | A forced error on UAT appears in Sentry within 5 minutes with no email address or IP in the event |
| E5 | Email lands | A sign-in email reaches the inbox, not spam, at one Gmail, one iCloud and one Outlook address; SPF, DKIM and DMARC pass in the headers |
| E6 | UAT data reset | Trips and profiles hold only the founder's account; `select id, handle from profiles where is_moderator` returns the expected list |
| E7 | Allow-list loaded | Every invited tester's email is in `private.onboarding_allowlist`, with no `*` or public-domain entries such as `@gmail.com`; an unlisted email reaches the "invite-only" screen; a listed one typed with capitals is accepted |
| E8 | Feedback live | "Send feedback" is on every page, opens prefilled with the route and build SHA, and a test submission reaches the founder |
| E9 | Deploy smoke checks | Signed-in smoke test passes; anon `curl …/rest/v1/trips?visibility=eq.unlisted` returns `[]`; `curl -I` shows CSP, HSTS and `frame-ancestors 'none'` |

## 6. Exit criteria

| # | Criterion | How to check |
|---|---|---|
| X1 | Scenarios S1–S8 pass on every device | The run log in section 11 is all Pass, including screen-reader runs; retests after fixes count |
| X2 | No open P0 or P1 | `bd list -l uat --priority-max P1` returns nothing (closed issues are hidden by default) |
| X3 | At least 80% of testers complete the loop | A tester counts when they belong to a trip with an accepted invite, at least one expense, and at least one settlement they are party to. The founder runs a read-only query at exit and records the count. |
| X4 | Zero money-privacy failures | No confirmed defect where a non-member saw an amount, balance, settlement or post; the latest run of every privacy check (section 8) passed; the pgTAP matrix is still green |
| X5 | Founder sign-off | Section 11 signed |

## 7. Scenarios

Check IDs (for example `S5-N2`) are what defect reports cite. "Refused" means the action fails with a plain-language message, nothing changes, and no raw error text, code or stack trace shows.

### S1. Sign in on a phone, then onboard

- **Who:** any new tester on the allow-list; ORG runs it first. **Routes:** `/auth/sign-in`, `/auth/confirm`, `/onboarding/handle`, `/`
- **Preconditions:** Entry criteria met; the tester has never signed in.

| # | Step | Expected result |
|---|---|---|
| 1 | Open `https://uat.<domain>` on a phone | Sign-in screen with the test-build notice |
| 2 | Enter an email and send | A confirmation says to check email; the email arrives in the inbox within 2 minutes |
| 3 | Type the 6-digit code on the sign-in screen | Signed in; lands on handle onboarding |
| 4 | From another browser or phone, request a new email and tap its link inside the Gmail or Outlook app | Signed in there too, on onboarding; no "invalid link" error |
| 5 | Type a handle with capitals, then one that is taken | Capitals become lowercase as you type; "taken" shows before you submit |
| 6 | Choose a free handle, confirm 18+, accept the three documents, submit | Home shows "Plan a trip" and an empty "Your trips" |
| 7 | Sign out, then sign in again | Straight to home, not back to onboarding |

| Check | Expected result |
|---|---|
| S1-N1 A wrong code, then a code more than an hour old | Refused each time; a new code can be requested |
| S1-N2 An email that isn't allow-listed, with no invite link | "Invite-only" screen; no profile created |
| S1-N3 Submit without 18+ or the documents ticked | Refused; the missing item is named |
| S1-N4 Try six taken handles while typing, then submit a free one | Succeeds; live checks don't use up the 5-per-hour onboarding limit |
| S1-N5 (ADM) Sign-in URL with `next=//example.com` | Stays on Jettison after sign-in |

### S2. Create a trip and share the link

- **Who:** ORG. **Routes:** `/trips/new`, `/trips/[id]`
- **Preconditions:** S1 done for ORG.

| # | Step | Expected result |
|---|---|---|
| 1 | From home, tap "Plan a trip" (`/trips/new`); enter a name, dates and currency; save | `/trips/[id]` lists ORG as organizer; the trip shows under "Your trips" |
| 2 | Edit the name and dates | Changes show on the trip and on home |
| 3 | Create an invite link with the defaults and share it | The link works for a week and lets in 10 people (§12 Q6). The share sheet opens where the browser supports it; otherwise the link copies with a visible confirmation. Copy link copies the same link again at any time |
| 4 | Turn that link off, then create a new one | The old link stops working (S3-N1); the new one works |
| 5 | Create a throwaway trip and delete it | Asks to confirm; the trip leaves home; its URL shows "not found" |

| Check | Expected result |
|---|---|
| S2-N1 Visibility options | Private only; no public or unlisted choice |
| S2-N2 OUT-anon opens `/trips/[id]` | Sent to sign-in; no trip name, dates or members shown first |
| S2-N3 OUT-signed-in and OUT-follower open `/trips/[id]` | "Not found", identical to a trip that doesn't exist |
| S2-N4 Any way for ORG to add a person without that person accepting | None; joining always goes through an invite link |

### S3. A new user joins from the link

- **Who:** MEM (one new user who isn't allow-listed, one returning user), ORG. **Routes:** `/join/[token]`, `/auth/sign-in`, `/onboarding/handle`, `/trips/[id]`
- **Preconditions:** A live invite link from S2.

| # | Step | Expected result |
|---|---|---|
| 1 | Open the link while signed out | Preview: trip name, dates, organizer's display name, how many are going, and a Join button. The address bar shows `/join`, not the link's code |
| 2 | Tap Join, sign in with a code, and finish onboarding | Allowed through the invite even though the email isn't allow-listed; finishing onboarding joins the trip and lands on `/trips/[id]` as a member |
| 3 | ORG refreshes the trip | MEM appears in the member list |
| 4 | A returning user, signed in, opens the link and joins | Lands on the trip without onboarding again |
| 5 | MEM opens the same link again | Goes to the trip; no duplicate membership |

| Check | Expected result |
|---|---|
| S3-N1 A revoked, used-up or mistyped token | A plain "this invite no longer works" message and no trip details |
| S3-N2 (ADM) A token past its expiry (set a short expiry, or backdate it) | Same as S3-N1 |
| S3-N3 Preview page | Never shows amounts, balances, expenses, posts or member emails |
| S3-N4 MEM looks for organizer controls | No edit, delete, remove-member or invite-management controls, and the link itself isn't shown |
| S3-N5 Someone who blocked, or was blocked by, the organizer or any member opens a live link while signed in | The S3-N1 message; nothing reveals the block (§12 Q9) |
| S3-N6 Open the preview, then expire, fill or turn off the link (ADM), then tap Join while signed in | Refused, saying why (expired, full or turned off) and to ask for a new link |

### S4. Expenses: equal and exact splits, edit, delete

- **Who:** A (ORG), B and C, in a USD trip. **Routes:** `/trips/[id]`
- **Preconditions:** S3 done; exactly three members and no expenses.
- **Money cases:** leftover cents (steps 1–2, S4-N2); an exact split that doesn't add up (steps 4–5); edit and delete (steps 3, 7, 8). Mark as paid and void are in S5.

| # | Step | Expected result |
|---|---|---|
| 1 | A adds $100.00 paid by A, split equally | A's share is $33.34, B's and C's $33.33: the payer takes the odd cent. They sum to $100.00 |
| 2 | A adds the identical expense again | The same shares: A takes the odd cent again |
| 3 | Delete the step 2 expense | Asks to confirm; it's gone; balances return to their step 1 values |
| 4 | B adds $90.00 paid by B, exact split $30.00 / $30.00 / $20.00 | Refused: the form says $10.00 is still unassigned; nothing saved |
| 5 | Change the split to $30.00 / $30.00 / $40.00 | Refused: $10.00 over |
| 6 | Change it to $30.00 / $30.00 / $30.00 and save | Saved; shares show exactly as entered |
| 7 | Edit the step 1 expense to $120.00 | Shares become $40.00 each; balances update |
| 8 | Delete every expense | Each asks to confirm; every balance reads $0.00, ready for S5 |

| Check | Expected result |
|---|---|
| S4-N1 An amount of 0, a negative amount, `12.345` or letters | Refused, or the field won't take it; never silently rounded |
| S4-N2 $0.02 paid by A, split equally three ways | A $0.01; one of B and C $0.01 and the other $0.00, always the same one; sum $0.02 |
| S4-N3 $1,000,000.00 | Saved, or refused with a stated cap |
| S4-N4 Every amount | Two decimals, tabular figures, the trip currency, no float artifacts like 33.330000001 |

### S5. Balances, simplified debts, mark as paid

- **Who:** A (ORG), B, C. **Routes:** `/trips/[id]`, `/`
- **Preconditions:** S4 done; all balances $0.00. Enter this fixture:

| Expense | Paid by | Split | A | B | C |
|---|---|---|---|---|---|
| Hotel deposit $90.00 | A | Equal | 30.00 | 30.00 | 30.00 |
| Dinner $30.00 | B | Equal | 10.00 | 10.00 | 10.00 |
| Taxi $12.00 | C | Exact | 2.00 | 4.00 | 6.00 |
| **Balance (paid − share)** | | | **+48.00** | **−14.00** | **−34.00** |

| # | Step | Expected result |
|---|---|---|
| 1 | Each member opens the balances | A is owed $48.00; B owes $14.00; C owes $34.00; the three sum to $0.00 |
| 2 | View suggested payments | Two payments: B pays A $14.00 and C pays A $34.00 (settling pair by pair would take three) |
| 3 | Each member opens home | Real totals that match the trip ("You owe $14.00" for B), not a hardcoded "$0" |
| 4 | B marks the $14.00 to A as paid | Recorded with the date and who marked it; B is at $0.00, A at +$34.00 |
| 5 | C marks the $34.00 to A as paid | Every balance $0.00; the trip reads as settled |
| 6 | Void B's payment | A reversing entry appears; B owes $14.00 again; both entries stay in the history |
| 7 | B marks it paid again | Settled again; the history reads paid, voided, paid |

| Check | Expected result |
|---|---|
| S5-N1 Edit a recorded payment, or void the same one twice | No edit control; the second void is refused |
| S5-N2 Balances after every step | Always sum to $0.00 |
| S5-N3 OUT-follower | No balances, payments or totals for this trip anywhere, including their home |

### S6. Text posts and Report

- **Who:** B, C, ADM. **Routes:** `/trips/[id]`, the admin reports page (route set by the posts chunk)
- **Preconditions:** The trip from S5.

| # | Step | Expected result |
|---|---|---|
| 1 | B writes a text post | All members see it in time order, with author name and time |
| 2 | C reports B's post | A calm confirmation; B isn't told who reported it |
| 3 | ADM opens the admin reports page | The report shows the post text, trip, reporter and time; ADM can record a decision |
| 4 | B posts `<b>hi</b> <script>alert(1)</script>` | Shown as plain text; nothing runs |

| Check | Expected result |
|---|---|
| S6-N1 OUT-anon, OUT-signed-in, OUT-follower | No post text anywhere: trip page, invite preview, profiles, home |
| S6-N2 Photo upload | No upload control in UAT-1 |
| S6-N3 A non-ADM opens the admin reports page | "Not found" |
| S6-N4 The admin reports page | Shows no trip amounts or balances |
| S6-N5 (ADM) Post past the hourly limit (30 today) | Refused with a friendly rate-limit message |

### S7. Leave a trip or remove a member, with the balance rule

- **Who:** A (ORG), B, C, and D, a fourth member with no expenses. **Routes:** `/trips/[id]`
- **Preconditions:** From the end of S5, void both standing payments so B owes $14.00 and C owes $34.00 again; D joins with a live link.

| # | Step | Expected result |
|---|---|---|
| 1 | C taps "Leave trip" | Refused: shows C's $34.00 balance and how to settle it |
| 2 | A tries to remove B | Refused for the same reason |
| 3 | C marks the $34.00 to A as paid, then leaves | Asks to confirm; C leaves; the trip disappears from C's home |
| 4 | C reloads the trip URL | "Not found" |
| 5 | A removes D (balance $0.00) | D loses access; other balances don't change |
| 6 | A makes a new invite link (New link); D tries the old one | The S3-N1 message |

| Check | Expected result |
|---|---|
| S7-N1 B or C looks for remove-member controls | None for anyone but the organizer |
| S7-N2 The taxi C paid before leaving | Still in the history; balances still sum to $0.00 |
| S7-N3 A looks for "Leave trip" | None; the page says the organizer stays until the trip is deleted |
| S7-N4 A deletes the trip while B still owes $14.00 | Refused: says what to settle first; nothing is deleted |

### S8. Settings, block and unblock, second device

- **Who:** B; a co-member; a stranger S (OUT-signed-in). **Routes:** `/settings`, `/[handle]`
- **Preconditions:** S1 done for S; S follows B; B follows someone outside the trip.

| # | Step | Expected result |
|---|---|---|
| 1 | B edits display name and bio in `/settings` | Saved; shows on `/[handle]` and in trips |
| 2 | B hides their profile; S, a co-member and someone B follows each open B's `/[handle]` | S can't see it, even though S follows B; the other two can |
| 3 | B makes the profile visible again, then blocks S from S's profile | S can't see B's profile or follow B; the follow is gone both ways |
| 4 | B unblocks S in `/settings` → Blocked accounts | S is listed, then removed; S can follow again |
| 5 | B signs in on a second device with a code | Same profile and trips; a change on one shows on the other after refresh |
| 6 | B requests account deletion | The confirmation says it's handled by hand and how long it takes; ADM sees the request |
| 7 | B signs out from `/settings` | Back to sign-in; the Back button doesn't reveal trip pages |

| Check | Expected result |
|---|---|
| S8-N1 Change the handle | Not possible; shown read-only |
| S8-N2 S tries to follow B while blocked | Refused with a calm message |
| S8-N3 Anyone's `/[handle]` | Never shows private trips to non-members, and never shows amounts |
| S8-N4 B blocks a co-member from a shared trip | Both stay in the trip and still see each other's name, costs and posts there; outside the trip the block applies |

## 8. Privacy sweep

Run as OUT-anon, OUT-signed-in and OUT-follower at the end of S5, and again at the end of S8 adding the departed C and removed D. Any failure is P0.

| Check | Where | Expected result |
|---|---|---|
| PV1 | `/trips/[id]` | Sign-in for OUT-anon; "not found" for everyone else |
| PV2 | `/join/[token]` with a live link | Preview only (name, dates, organizer, how many are going); no money, posts or member names |
| PV3 | The organizer's and members' `/[handle]` | No private trips, amounts or posts |
| PV4 | Their own home | Nothing about the trip, not even a $0.00 total |
| PV5 | The trip URL pasted into iMessage or WhatsApp | The link preview shows no amounts, balances or post text |
| PV6 | (ADM) REST API as OUT-signed-in for this trip's rows in `expenses`, `expense_shares`, `settlements`, `trip_posts`, `trip_invites`, `trip_members` | `[]` for each |

## 9. Feedback and triage

**Channel.** "Send feedback" is on every page and opens a form prefilled with the route and build SHA. Use it for everything. If you see someone else's money or posts, or you're locked out, also text the founder right away. Never paste a sign-in code; paste an invite link only when the bug is about the link, and the organizer revokes it afterwards.

| Severity | Meaning | Examples | Response |
|---|---|---|---|
| P0 | Privacy or money integrity broken, data lost, or nobody can sign in | A non-member sees a balance; balances don't sum to $0.00 | Same day: fix or roll back; pause testing if needed |
| P1 | A scenario step can't be done on a matrix device, with no workaround | The join link fails on Android; VoiceOver can't reach "Mark as paid" | Fix before exit |
| P2 | Works, but with a workaround, confusing copy or an accessibility gap | Unclear error copy; a 40px target | Fix in UAT-1 if cheap, else UAT-2 |
| P3 | Polish and suggestions | Spacing, wording ideas, feature requests | Backlog |

**Weekly triage** (Mondays, ADM): read new feedback, Sentry issues and the group chat; file one Bead per defect with `bd create "<title>" -t bug -p <0–3> -l uat -d "<report>" --json` (severity maps 1:1 to Beads priority); mark repeats with `bd duplicate` and note how many testers hit it; tell each reporter the outcome. P0s never wait for Monday.

**Defect report template**

```text
Title:            <what broke, in one line>
Check ID:         <e.g. S5-N2, or "exploratory">
Severity (guess): P0 / P1 / P2 / P3
Device:           <phone model, OS version, browser; screen reader if on>
Signed in as:     <handle, never email>
Route and build:  <prefilled>
Steps:            1. … 2. … 3. …
Expected:         <what should have happened>
Actual:           <what happened, with the exact on-screen text>
How often:        always / sometimes / once
Workaround:       <if any>
Evidence:         <screenshot or recording>
```

## 10. Tester notice

**Short notice** (sign-in screen and the top of the Terms): "Test build. Data may be reset, and no real money moves through Jettison."

**Welcome message** (the founder sends it with each invite):

> You're invited to try Jettison, a new way to plan group trips and keep shared costs straight. It's an early test build for people 18 and older, so a few things to know:
>
> - Use it with real people, for a real or pretend trip. No real money moves through the app: settle up however you normally would, then mark it as paid in Jettison.
> - What you add may be wiped between test rounds, so keep your own record of anything that matters.
> - Your trips, costs and posts are visible only to the people in each trip. Other testers can see your handle, name and bio unless you hide your profile in Settings.
> - If something is broken or confusing, tap "Send feedback" at the bottom of any page. If you ever see someone else's money or posts, text me straight away.
>
> Thank you for helping.

## 11. Run log and sign-off

Enter Pass with the date and build SHA, or the failing Bead ID.

| Scenario | iPhone Safari | Android Chrome | Desktop | VoiceOver | TalkBack |
|---|---|---|---|---|---|
| S1–S5 | | | | | |
| S6–S8 | | | | n/a | n/a |
| Privacy sweep | | | | n/a | n/a |

| Exit criterion | Evidence | Result | Signed and dated |
|---|---|---|---|
| X1 Scenarios pass on every device | Run log above | | |
| X2 No open P0 or P1 | `bd list` output | | |
| X3 At least 80% completed the loop | ___ of ___ testers | | |
| X4 Zero money-privacy failures | Privacy sweep and pgTAP run | | |
| X5 UAT-1 accepted | Founder decision | | |

## 12. Open questions

Gaps in the Phase 2 spec that change what a scenario expects. Answer each in its chunk plan, then update this file.

1. Who can edit or delete an expense or a post, and what does an admin decision on a report do to the post?
2. Which member gets the leftover cent? **Answered 2026-11-02 (`tripplanner-2o5.4`):** in an equal split everyone gets the amount ÷ n rounded down, and the leftover cents go one each to the payer first, if they're in the split, then to the other members in ascending member-ID order. Shares never differ by more than a cent, and the same amount, payer and members always give the same shares. `splitEqual` in `lib/money.ts` implements it; S4 steps 1–2 and S4-N2 expect it.
3. Who can mark a debt as paid or void it (payer, payee or either), and are partial payments or overpayment allowed?
4. Can the organizer leave, and can a trip with expenses be deleted? S7 assumes the zero-balance rule also blocks removal.
   - **Answered 2026-11-02 (founder, `tripplanner-718`):** The organizer can't leave in UAT-1; they stay until the trip is deleted. Handing the organizer role to someone else is a post-UAT Bead. The organizer can delete a trip only when every balance is zero, the same rule that blocks leaving and removal (`tripplanner-2o5.3` adds the balance check to all three). Deleting removes the trip, its posts and its cost history for every member.
5. What happens to a shared trip when one member blocks another?
   - **Answered 2026-11-02 (founder, `tripplanner-718`):** Both stay members. Inside the trip each still sees the other's name, costs and posts, so the shared ledger reads correctly. Outside the trip the block works as usual: no profile view, no follow, no DMs. Either one can leave once settled, or the organizer can remove one of them.
6. What are the default invite expiry and maximum uses?
   - **Answered 2026-11-03 (founder, `tripplanner-2o5.1`):** A link works for a week and lets in 10 people unless the organizer picks otherwise: 1, 3, 7, 14 or 30 days, and 1, 5, 10, 25 or 50 people. Nothing is unlimited while Jettison is invite-only, because each use also lets one new account past the allow-list. A trip has one live link: a new link turns the old one off. Removing a member doesn't turn the link off, so the remove dialog says to make a new one if they still have it.
7. Who can edit a trip?
   - **Answered 2026-11-02 (founder, `tripplanner-718`):** The organizer only: name, dates and description. The currency is fixed when the trip is created. Only the organizer can delete the trip or remove members; any member can leave.
8. Can the organizer copy an invite link again after making it?
   - **Answered 2026-11-03 (founder, `tripplanner-2o5.1`):** Yes. The link is stored so that only the trip's organizer can read it; members, other users and signed-out visitors can't. A leaked link is turned off or replaced.
9. Can someone join when they and someone in the trip have blocked each other?
   - **Answered 2026-11-03 (founder, `tripplanner-2o5.1`):** No, whichever way the block goes and whoever in the trip it involves, organizer included. They see the same "this invite no longer works" as for a dead link, so the block isn't revealed. People already in a trip together both stay (Q5). Known limit: the preview also works signed out (S3 step 1), so someone who compares the signed-out and signed-in pages can tell the link works for others; either way it shows only the four preview fields.
10. Who can make invite links?
    - **Answered 2026-11-03 (founder, `tripplanner-2o5.1`):** Only the organizer. Members see neither the link nor the controls.
