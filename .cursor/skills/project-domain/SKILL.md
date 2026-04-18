---
name: project-domain
description: Canonical domain language and MVP scope for the group-trip-payments product. Use when modeling new entities, naming variables/tables/components in the trip / member / expense / share / payout space, writing user stories or acceptance criteria, deciding whether a feature is in MVP, or sanity-checking that examples don't drift away from the agreed terminology.
---

# Project domain

The product is **Jettison** — a **mobile-first web app** that is **a social network for group travel with payments built in**: discover trips worth joining with the people you actually know, plan them together, and split the money so no one fronts the bill. Use the name "Jettison" in examples, marketing copy, and brand voice; use neutral verbs ("Pay", "Send", "Settle") in transactional UI strings.

The vision pivot from transactional-only to social-first is recorded in [`docs/adr/0002-social-vision-pivot.md`](../../../docs/adr/0002-social-vision-pivot.md). Read it before scoping anything in the social surface — it carries the moderation hard-rules and Phase 2 gates.

## Canonical terms

Use these names consistently in code, schema, UI copy (when neutral), and Beads issues.

### Trips + payments (money side)

| Term | Meaning |
|------|--------|
| **Trip** | A bounded plan with participants, costs, and an organizer. Carries a `visibility` enum: `private` \| `unlisted` \| `public`. |
| **Visibility** | The reach of a Trip and its non-money content. `private` = members only; `unlisted` = link-shareable, not in explore; `public` = world-readable + appears in explore. **Money is never publicly readable, regardless of visibility.** |
| **Member** | A Profile attached to a Trip in some role (organizer, participant, viewer). |
| **Organizer** | The Member who creates the trip, coordinates payments, and approves join requests by default. |
| **Join request** | A request from a non-member Profile to join a `public` (or shared `unlisted`) Trip. Default = approval-required by the organizer. |
| **Expense** | A shared cost on a trip (hotel, venue, transport, food). Money. Members-only. |
| **Share** | A member's portion of an expense. Money. Members-only. |
| **Payout** | A money movement: member → organizer, member → venue, or organizer → venue. Money. Members-only. |
| **Venue** | A vendor that may eventually receive payments directly. |

### Profiles + social graph (content side)

| Term | Meaning |
|------|--------|
| **Profile** | A user's public identity — handle, display name, avatar, bio. One per `auth.users` row. Avatars go through the moderation pipeline. |
| **Follow** | A directed (asymmetric) edge between two Profiles. No symmetric "friend request"; A following B does not imply B follows A. |
| **Post** | A piece of in-trip content (text + optional photos), authored by a Member, attached to a Trip. State: `pending_media` \| `pending_review` \| `published` \| `rejected`. Inherits the parent Trip's visibility. |
| **Comment** | A reply on a Post. Text only at MVP (no inline media). |
| **Reaction** | A small custom-illustrated travel-themed glyph (3–5 total) attached to a Post by a Profile. Not thumbs/heart/emoji. |
| **Notification** | An in-app notification row delivered to a Profile (new follower, post published, post rejected, comment, reaction, payment received, join request, new DM). |
| **DM (Direct Message)** | A 1:1 conversation between two Profiles, **gated** by mutual-follow OR shared trip OR open join request. No cold DMs from strangers. |
| **Moderation Decision** | A row recording a moderator's `approve` or `reject` ruling on an uploaded image, with a reason code from a fixed list. Audit-grade. |
| **Report** | A user-filed complaint against a Post, Comment, Profile, Trip, or DM. Funnels into the same moderator queue as image-review escalations. |
| **Block** | A directional relationship: blocker hides all of blocked's content; blocked cannot DM blocker; mutual invisibility on each other's profiles. |
| **Mute** | A directional relationship: muter silently hides muted's content from feeds; muted is not notified. |

Do **not** invent synonyms ("Group" for Trip, "Bill" for Expense, "Person" for Member, "Friend" for Follow, "Like" for Reaction, "Story" for Post) — they fragment search and cognition.

## MVP user stories

### Money-side stories

- As an **organizer**, I create a Trip, invite Members, add Expenses, and see who owes what.
- As a **participant**, I open a Trip invite, see my Shares, and pay them in one place.
- As an **organizer**, I see who has paid and chase only the people who haven't.
- (Behind a flag) As an **organizer**, I route a payment directly to a Venue instead of routing through me.

### Social-side stories

- As a **traveler with a Profile**, I follow people whose trips I want to see, and my followers feed shows me their published Posts in chronological order.
- As a **trip organizer**, I mark a Trip as `public` so non-members can discover it in the explore tab and request to join. I approve or decline each join request.
- As a **trip member (poster)**, I publish a Post to a Trip with a photo. The post sits in `pending_review` until a moderator approves it; I see an on-brand "your postcard is in the mail" treatment with an expectation-set timeline.
- As a **trip member (commenter / reactor)**, I comment on Posts in trips I can see, and react with one of the small set of custom Jettison reaction glyphs.
- As a **traveler discovering a public Trip**, I can see the trip's itinerary, photos, and posts — but **never** the trip's expenses, shares, or payouts.
- As **two Profiles with mutual context** (mutual follow OR shared trip OR open join request), we can DM each other. Strangers cannot DM me.
- As **any user** I can block or mute another Profile; I can report any Post, Comment, Profile, Trip, or DM into the moderator queue.

## Out of scope (MVP) — say no to drift

- BNPL, financing, credit checks.
- Native mobile apps (Expo / React Native).
- Vendor onboarding marketplace UX.
- Heavy analytics dashboards.
- **Stories / ephemeral content, live video, influencer monetization tools, algorithmic feed ranking** — explicitly OUT.

### Deferred to Phase 2 (gate-criterion driven)

These are not in MVP and are filed at P3 with a `phase-2` Beads label. Each has a numeric gate criterion in [`docs/adr/0002-social-vision-pivot.md`](../../../docs/adr/0002-social-vision-pivot.md):

- **Lawyer-reviewed ToS + Community Guidelines + privacy policy** — gate: 5,000 MAU OR first abuse incident with material exposure.
- **Dedicated trust & safety operating model** (24/7 triage, on-call, formal SLAs, secondary moderator hires) — gate: 25,000 MAU OR ToS lawyer recommends earlier.
- **Algorithmic feed ranking** (replaces chronological) — gate: chronological feed measurably hurting retention.
- **Stories / ephemeral content, live video, influencer monetization tools** — no hard gate; re-evaluate post-MVP.

Note: "social feed" and "public trip discovery" are **no longer out of scope** — they are core to the social-first MVP per ADR 0002.

## Mobile-first acceptance hints

For each major flow, the happy path must clear these on a 360 px viewport:

| Flow | Mobile acceptance hint |
|------|------------------------|
| **Create trip + invite members** | Completable without horizontal scroll; share-link or invite action reachable one-handed. |
| **Add expense** | Numeric/currency keyboard appears; equal-split is the default; custom-split is one tap away. |
| **Pay my share** | Amount, recipient, and confirm are visible together without scrolling; touch targets ≥ 44 px. |
| **Organizer dashboard** | "Who hasn't paid" is the primary view at narrow widths; details collapse by default. |

## Where this maps to data (sketch — not committed schema)

Until tables exist, a rough mapping:

- `profiles` → one row per authenticated user; handle / display name / avatar / bio / `is_moderator` flag.
- `follows` → directed (asymmetric) edges between profiles.
- `trips` → trip rows owned by an organizer; carries the `visibility` enum.
- `trip_members` → membership join table with role.
- `join_requests` → pending requests from non-members to join `public` / `unlisted` trips.
- `expenses` → costs attached to a trip with a payer. **Members-only RLS.**
- `expense_shares` → per-member shares of an expense. **Members-only RLS.**
- `payouts` → recorded money movements. **Members-only RLS.**
- `posts` → in-trip posts; carries the `pending_media` / `pending_review` / `published` / `rejected` state.
- `post_images` → image rows attached to posts; carries the `pending_review` / `approved` / `rejected` state and the moderation decision reference.
- `comments`, `reactions`, `notifications` → social interaction tables.
- `dm_threads`, `dm_messages` → direct messages, with the gating predicate enforced in RLS.
- `moderation_decisions` → audit-grade approve/reject records by moderators.
- `reports` → user-filed reports against any of the above.
- `blocks`, `mutes` → per-user safety primitives.

Schema lands in Supabase migrations. RLS ships in the same migration as the table — see `supabase-security.mdc` and the `project-supabase` skill.

## Naming reminder

The product is **Jettison**. The repo folder `maya-travel-app` and the Beads prefix `tripplanner` are **legacy / internal** — both are scheduled to be renamed (follow-ups of `tripplanner-a8c`); do not adopt them as the brand and do not let them leak into user-visible surfaces. Never use the verb "jettison" inside transactional UI ("Jettison your share" reads as *throw it away*) — reserve the verb for marketing voice.
