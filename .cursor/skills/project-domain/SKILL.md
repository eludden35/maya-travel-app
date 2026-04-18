---
name: project-domain
description: Canonical domain language and MVP scope for the group-trip-payments product. Use when modeling new entities, naming variables/tables/components in the trip / member / expense / share / payout space, writing user stories or acceptance criteria, deciding whether a feature is in MVP, or sanity-checking that examples don't drift away from the agreed terminology.
---

# Project domain

The product is **Jettison** — a **mobile-first web app** for organizing group trips, splitting shared costs, and moving money to organizers or directly to venues. Use the name "Jettison" in examples, marketing copy, and brand voice; use neutral verbs ("Pay", "Send", "Settle") in transactional UI strings.

## Canonical terms

Use these names consistently in code, schema, UI copy (when neutral), and Beads issues.

| Term | Meaning |
|------|--------|
| **Trip** | A bounded plan with participants, costs, and an organizer. |
| **Member** | A user attached to a trip in some role (organizer, participant, viewer). |
| **Organizer** | The member who creates the trip and (typically) coordinates payments. |
| **Expense** | A shared cost on a trip (hotel, venue, transport, food). |
| **Share** | A member's portion of an expense. |
| **Payout** | A money movement: member → organizer, member → venue, or organizer → venue. |
| **Venue** | A vendor that may eventually receive payments directly. |

Do **not** invent synonyms ("Group" for Trip, "Bill" for Expense, "Person" for Member) — they fragment search and cognition.

## MVP user stories

- As an **organizer**, I create a Trip, invite Members, add Expenses, and see who owes what.
- As a **participant**, I open a Trip invite, see my Shares, and pay them in one place.
- As an **organizer**, I see who has paid and chase only the people who haven't.
- (Behind a flag) As an **organizer**, I route a payment directly to a Venue instead of routing through me.

## Out of scope (MVP) — say no to drift

- BNPL, financing, credit checks.
- Social feed, public trip discovery, comments-as-feed.
- Native mobile apps (Expo / React Native).
- Vendor onboarding marketplace UX.
- Heavy analytics dashboards.

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

- `trips` → trip rows owned by an organizer.
- `trip_members` → membership join table with role.
- `expenses` → costs attached to a trip with a payer.
- `expense_shares` → per-member shares of an expense.
- `payouts` → recorded money movements.

Schema lands in Supabase migrations. RLS ships in the same migration as the table — see `supabase-security.mdc` and the `project-supabase` skill.

## Naming reminder

The product is **Jettison**. The repo folder `maya-travel-app` and the Beads prefix `tripplanner` are **legacy / internal** — both are scheduled to be renamed (follow-ups of `tripplanner-a8c`); do not adopt them as the brand and do not let them leak into user-visible surfaces. Never use the verb "jettison" inside transactional UI ("Jettison your share" reads as *throw it away*) — reserve the verb for marketing voice.
