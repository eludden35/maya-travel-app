# Product engineering notes

Concise developer-facing complement to [`initial-app-idea.md`](initial-app-idea.md). Two pages or less by design.

## What we are building

**Jettison** is a **mobile-first web app** for organizing group trips, splitting shared costs, and moving money to organizers or directly to venues.

> _Jettison is the mobile-first way for groups to plan, split, and settle shared trips and events — so no one fronts the money or chases anyone afterward._

## Brand

- **Name-of-record:** **Jettison** (full word). Recorded in [`AGENTS.md`](../AGENTS.md) and used wherever a brand reference is needed.
- **Stylization:** **`JTSN` is the secondary mark** — used for tight surfaces (favicon, app shortcut, social avatar, monogram lockups) where the full wordmark won't read. The primary wordmark is the full word **Jettison**, set in the display face (see Design direction → Type). Promotion of JTSN to primary stays open as the brand earns recognition; for MVP, it is monogram only.
- **Why this name (in one paragraph):** the product's core promise is shedding the friction of group money — no one fronts the bill, no one chases anyone afterward. "Jettison" captures *casting off* that burden in a single, memorable verb. It scales beyond travel into general group money flows (events, reunions, recurring obligations) without locking us into a travel vertical, and the trademark space in USPTO classes 36 (financial) and 39 (travel) is currently uncrowded.
- **Words to avoid in product copy:** never use the verb "jettison" in transactional UI strings ("Jettison your share" reads as *throw it away*). Use it freely in marketing and brand voice ("Jettison the awkward middle"), but not as an action verb in payment flows.
- **Domain posture:** `jettison.com` is held by an unrelated staffing agency — not a trademark conflict, but the prime domain is unavailable. Standard-fintech fallbacks (`jettison.app`, `jettison.co`, `getjettison.com`, `usejettison.com`) and the single-`t` defensive variant `jetison.com` are the working set; final purchase is a follow-up.

## Competitor to watch

**[Let's Jetty](https://www.letsjetty.com/)** (`letsjetty.com`) — collaborative group trip planner targeting the same audience (girls' trips, family reunions, bachelorette parties). They do **planning + itinerary + group survey**; they do **not** do payments. We're adjacent on planning, distinct on money. Track for product positioning, not for naming conflict (the words "Jetty" and "Jettison" are distinct enough in spoken + written contexts).

## Domain glossary

| Term | Meaning |
|------|--------|
| **Trip** | A bounded plan with participants, costs, and an organizer. |
| **Member** | A user attached to a trip in some role (organizer, participant, viewer). |
| **Organizer** | The member who creates the trip and (typically) coordinates payments. |
| **Expense** | A shared cost on a trip (hotel, venue, transport, food). |
| **Share** | A member's portion of an expense. |
| **Payout** | A money movement: member → organizer, member → venue, or organizer → venue. |
| **Venue** | A vendor that may eventually receive payments directly. |

These names are stable language — use them in code, schema, UI copy (when neutral), and Beads issues.

## In scope (MVP)

- Create a trip and invite members.
- Add expenses and split them (equal or custom shares).
- Track who paid what and who owes whom.
- Move money: member → organizer (peer flow). Venue payouts behind a feature flag.

## Out of scope (MVP)

- BNPL / financing flows.
- Heavy social feed, public trips, discovery.
- Native mobile clients (Expo/React Native).
- Vendor onboarding marketplace UX.

## Trust and money boundaries (security)

These are **non-negotiable** and reflected in [`.cursor/rules/supabase-security.mdc`](../.cursor/rules/supabase-security.mdc):

- **RLS on by default** for every user-facing table; policies ship in the same migration as the table.
- **Supabase service role key** is server-side only. It must **never** be imported by a `"use client"` module or any browser bundle.
- **Webhook secrets** (Stripe or otherwise) live in server env only. Webhook handlers must be **idempotent** (use the provider's idempotency key + a dedicated table or unique index).
- **Never log** full PAN-like fields, raw card data, or full webhook payloads containing secrets.

## Payments (placeholder, design constraint)

Provider TBD (likely Stripe). Whatever ships, the architecture must:

- Settle peer-to-organizer flows first; venue payouts come after.
- Keep idempotency at the boundary (provider request → our DB).
- Treat payment objects as **append-only** — corrections are new rows, not in-place edits.

## Mobile UX baselines

- Critical flows ("create trip", "add expense", "pay my share") complete on a 360 px wide viewport without horizontal scroll and, where reasonable, **one-handed**.
- No hover-only affordances; tap targets ≥ ~44×44 CSS px; native form features (`inputMode`, `autoComplete`, `enterKeyHint`) used wherever appropriate.
- Respect `safe-area-inset-*` on any persistent chrome.

## Design direction

Direction-level identity (closes `tripplanner-tw8`). Concrete hex values and final font weights are **sample-grade** here — they get re-verified for WCAG AA and license at scaffold time, in the spec-level lock follow-up Bead.

### Pillars

**Trust / warmth / momentum.** The product handles money between friends — visual choices reinforce reliability (trust), human warmth (it's group travel, not a bank), and a sense that the flow is moving forward (momentum, not dread).

### Mood

**Generous, tactile, considered, quietly confident.**

- *Generous* — generous spacing and type; the UI never feels cramped. Signals "we're not nickel-and-diming you."
- *Tactile* — surfaces feel like real materials (warm paper, layered cards), not floating gray rectangles.
- *Considered* — deliberate, never decorated; every element earns its place.
- *Quietly confident* — handling money should feel calm. Loud UIs read as untrustworthy.

### Layout motifs

- **Oversized money numerals (signature motif).** Totals, balances, and "you owe / you're owed" use oversized tabular-figure type with smaller labels around them. Money is the protagonist; the rest of the screen recedes. Instantly recognizable in screenshots.
- **Anchored bottom action bar.** Primary action lives in a thumb-reach bottom bar with `safe-area-inset-*` padding. Mobile-first, one-handed.
- **Layered warm surfaces.** Foreground cards sit over a soft warm background field; warmth comes from layering, not from heavy borders or default Material shadows.

### Color (direction-level samples — not final brand values)

Character: **warm neutrals, single confident accent, earthed semantics.** No cool corporate-fintech grays, no rainbow accent set, no glowy semantic colors. **Do not lift these hex values into a Tailwind config or token file verbatim** — they're proposals for the spec-level lock.

| Role | Sample hex | Usage |
|---|---|---|
| Ink (primary text, primary buttons) | `#1A1714` | Warm near-black with brown undertone — never pure `#000` |
| Ember (single accent) | `#D9531E` | Warm clay-orange; CTAs, brand moments, money-positive states. Body text overlay must be **Ink**, not white, for AA |
| Paper (app background) | `#FAF7F2` | Warm off-white, slight ochre undertone |
| Card (raised surfaces) | `#F1EBE0` | One step above Paper |
| Hairline (dividers) | `#E5DCCB` | Used sparingly; layering carries most separation |
| Muted text (tertiary only) | `#A89A82` | Never for body; ≥ 14 px only |
| Secondary text | `#5A4F3F` | Labels, metadata |
| Body text on light | `#2B2620` | Sits in the Ink ramp |
| Success | `#3F7A4D` | Deep moss, not Slack-green |
| Warning | `#C8862A` | Amber, not neon |
| Error | `#B8362E` | Warm red, not pure red |
| Info | `#3D6280` | Slate-blue, used sparingly |

Contrast intent: Ink-on-Paper exceeds AA at body sizes; Ember-on-Paper passes AA Large only — body-on-Ember must be Ink, not white. Full WCAG AA verification is the spec-level follow-up's job.

### Type

- **Display: Fraunces** (Google Fonts, SIL OFL, variable with optical-size axis). Warm, considered, slightly literary; carries the personality. Use the "Soft" optical setting at small display sizes.
- **Text: Inter** (Google Fonts, SIL OFL, variable). Trust-default; tabular figures via `font-variant-numeric: tabular-nums`. Distinctiveness comes from Fraunces + spacing + color, not from the body face.
- **Mono: JetBrains Mono** (Google Fonts, SIL OFL). Receipt rows, transaction IDs, dense money tables only — never headlines.

Modular scale (1.250, restrained):

| Step | Family | Size / line-height |
|---|---|---|
| Display XL | Fraunces | 48 / 56 |
| Display L | Fraunces | 36 / 44 |
| Display M | Fraunces | 28 / 36 |
| H1 | Inter | 24 / 32 |
| H2 | Inter | 20 / 28 |
| H3 | Inter | 18 / 26 |
| Body L | Inter | 17 / 26 |
| **Body** | **Inter** | **16 / 24** (line-height 1.5) |
| Body S | Inter | 14 / 22 |
| Caption | Inter | 13 / 20 |
| Mono | JetBrains Mono | 16 / 24, tabular |

No body text below 14 px on mobile. Headings tighten to roughly 1.2–1.3 line-height.

### Motion

Default state-change durations: **150–200 ms** ease-out for most transitions; **250 ms** for bottom-sheet opens. State changes always have a **non-motion equivalent** (color, copy, icon) — motion is reinforcement, never the only signal.

Reduced-motion behavior — honor `prefers-reduced-motion: reduce` globally:

- **Decorative motion** (cut entirely): hover shimmers, surface-lift animations, parallax on bottom-sheet open, micro-bounces on press, splash transitions.
- **Essential motion** (kept, but accelerated to ≤ 80 ms): payment-confirmation state change, success/error announcements, focus indicators, loading spinners (degrade to a static indicator if static is meaningful).
- Floor rule: 0.01 ms transition/animation duration for everything not in the essential list.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### Anti-patterns to refuse

- Generic SaaS dashboard look (gray cards, default shadows, default buttons).
- "AI slop" landing-page tropes (interchangeable hero + 3 columns + gradient blob).
- Travel-app pastiche (postcard imagery, airplane icons everywhere) used decoratively rather than purposefully.
- Cool corporate-fintech grays — wrong emotional register for "protecting friendships".
- Rainbow accent sets — Ember does the heavy lifting alone.

### Design tokens

Tokens live in the **`@theme` block in [`app/globals.css`](../app/globals.css)** — the Tailwind v4 idiom. Names map directly to utility classes (e.g. `--color-ink` → `text-ink` / `bg-ink` / `border-ink`).

- **Adding a token:** extend `@theme` in `globals.css`. Don't introduce a parallel token file or a Tailwind config object — there's exactly one source of truth.
- **Raw hex codes:** never live in components. If you need a new shade, add it to `@theme` first (and explain it in this file's "Color" section if it implies a brand decision).
- **Dark mode:** not yet — when it lands it will use a `[data-theme="dark"]` selector overriding the same token names, not a separate file. Tracked in Beads.

Distinction comes from: typography, color rhythm, spacing system, intentional motion, and the layout motifs above — not novelty that breaks usability.

## Architecture sketch

- **Source of truth:** Supabase Postgres. Other systems (payment provider, email) are integrators.
- **Server boundary:** secret-bearing operations run as Next.js **Server Components**, **Server Actions**, **Route Handlers**, or **[`proxy.ts`](../proxy.ts)** (Next.js 16 — the successor to `middleware.ts`) — never in a `"use client"` module. `SUPABASE_SERVICE_ROLE_KEY` and any other server secret stays out of the client bundle by file convention (see [`.cursor/rules/typescript-react.mdc`](../.cursor/rules/typescript-react.mdc)).
- **Client:** the browser holds only the Supabase **anon key** and per-user session cookies. `lib/supabase/client.ts` (browser) reads the anon key; `lib/supabase/server.ts` reads the same anon key plus cookies; service-role access lives in clearly named server-only modules (added when needed).
- **Session refresh:** [`proxy.ts`](../proxy.ts) → [`lib/supabase/middleware.ts`](../lib/supabase/middleware.ts) calls `supabase.auth.getUser()` on every request that isn't a static asset.
- **Background work:** kept minimal at MVP — webhooks + DB triggers for now, no separate worker.

## Open product/eng questions (track in Beads)

- Choose payment provider and country/currency scope.
- Choose test runner and CI surface (default recommendation: Vitest + Vercel checks).
- Visual mark design (logo, wordmark, favicon, app shortcut executing the JTSN secondary-mark role) — follow-up of `tripplanner-tw8`.
- Spec-level color + type lock (final hex ramp with WCAG AA verified, font weights + license) — follow-up of `tripplanner-tw8`, now unblocked by the locked styling stack (Tailwind v4 + `@theme`).
- Rename repo folder + npm package + Beads prefix to align with **Jettison** — follow-ups of `tripplanner-a8c`.
