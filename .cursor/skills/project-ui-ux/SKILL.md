---
name: project-ui-ux
description: UI/UX and creative-direction lens for this repo — user/context framing, happy path + edge states, distinctive design pillars (mood, type, color, motion, motifs, micro-interactions), anti-patterns to refuse, and accessibility beyond tap targets. Use when designing a new screen, picking colors/type/motion, reviewing visual changes, writing UI copy for the Jettison brand (without using "jettison" as a verb in transactional flows), or deciding whether a "creative" choice is sacrificing usability.
---

# Project UI/UX (with creative direction)

This skill expresses the **UI/UX lens** from `project-team-lenses.mdc`. The product must feel **exceptionally creative and visually distinctive** while remaining usable, accessible, and mobile-first.

Pairs with `.cursor/rules/project-creative-design.mdc` and `.cursor/rules/mobile-web-ui.mdc`.

## Before designing anything

Write down:

1. **User and context.** Organizer or participant? On a phone, in transit, distracted? Stressed about money?
2. **Primary action.** The one thing this screen exists to make easy. Everything else recedes.
3. **States.** Happy path **plus** empty, loading, error, permission-denied, offline. None of these are optional.
4. **Information hierarchy.** What does the eye land on first? What's secondary? What's tertiary?

## Distinctive design process

Distinction is **art direction**, not random decoration.

### 1. Pillars (locked)

The Jettison pillars are **trust / warmth / momentum**. They live in [`app-context/product-engineering.md`](../../../app-context/product-engineering.md) → "Design direction" → "Pillars". Don't change them in passing — propose a change in `product-engineering.md` first if there's a real reason.

- **Trust** — the product handles money between friends; visual choices reinforce reliability.
- **Warmth** — group travel is human; coldness or pure-corporate aesthetics are off-brand.
- **Momentum** — flows feel like they're moving forward; friction is visible only when intentional (confirming a payment, leaving a trip).

### 2. Mood + motifs (locked)

- **Mood keywords:** **generous, tactile, considered, quietly confident.** Read the gloss in `product-engineering.md` before applying — they have specific meanings.
- **Layout motifs:**
  - **Oversized money numerals (signature)** — totals/balances/owed amounts use oversized tabular-figure type with smaller labels around them. Money is the protagonist.
  - **Anchored bottom action bar** — primary action sits in a thumb-reach bottom bar with `safe-area-inset-*` padding.
  - **Layered warm surfaces** — foreground cards over a soft warm field; warmth from layering, not heavy borders or default Material shadows.
- New motifs require a written reason in `product-engineering.md`. Reuse existing motifs first — they accumulate identity.

### 3. Type, color, spacing

- **Type:** **Fraunces (display)** + **Inter (text)** + **JetBrains Mono (money tables only)**. Modular scale and body line-height (1.5 on 16 px body) live in `product-engineering.md` → "Type". No body text below 14 px on mobile.
- **Color:** warm neutrals + single confident accent (**Ember**, `#D9531E` sample) + earthed semantics. Full sample ramp + contrast intent in `product-engineering.md` → "Color". Treat hex values as direction-level until the spec-level lock follow-up Bead resolves them.
- **Spacing:** a deliberate scale (4 / 8 / 12 / 16 / 24 / 32 / 48), used consistently. Spacing rhythm is what makes a UI feel composed.

### 4. Motion + micro-interactions

- Motion **reinforces** state changes — a payment confirms with a crisp transition, not a cute bounce.
- Default durations: **150–200 ms** ease-out for most transitions; **250 ms** for bottom-sheet opens.
- Every animated state change has a **non-motion equivalent** (color, copy, icon) — motion is reinforcement, never the only signal.
- Respect **`prefers-reduced-motion`**. Full essential-vs-decorative motion list lives in `product-engineering.md` → "Motion".

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

## Money mode vs content mode

Per [`docs/adr/0002-social-vision-pivot.md`](../../../docs/adr/0002-social-vision-pivot.md), Jettison is two products living in one app: a **money product** (trips, expenses, payouts) and a **content product** (profiles, follows, posts, comments, reactions, DMs, explore, notifications). They share **all four** pillars (trust / warmth / momentum / quietly-confident-considered), the **same palette**, the **same type families**, and the **same spacing scale**. They differ in **layout grammar**:

| | Money mode | Content mode |
|---|---|---|
| Protagonist on screen | The number (Fraunces tabular figures, oversized) | The image / the trip / the post |
| Density | Generous; one big thing per screen | Generous still, but multiple cards in scroll grouped by Trip |
| Motion | Crisp confirmations (150–200ms ease-out) — no decoration | Subtle reveals on scroll; same durations; same reduced-motion rules |
| Copy register | Calm, neutral verbs ("Pay", "Send", "Settle") | Warm, ritual-flavored ("Pin to trip", "Mail it", "Write a trip note") |
| Card affordance | Receipt-like; tabular alignment | Postcard-like; image-dominant; Fraunces caption |

Surfaces that mix both modes (e.g. a trip detail screen showing both costs and posts) **separate them visually** — money panel uses money-mode treatment; post panel uses content-mode treatment. The same screen does not blend.

## Social surfaces — distinctive by default

The principle (also encoded as a hard rule in [`.cursor/rules/project-creative-design.mdc`](../../../.cursor/rules/project-creative-design.mdc)):

> **Reference Facebook, Instagram, BeReal, Geneva, Partiful, Letterboxd, and Strava freely for which interaction patterns work in social UX. Never copy their visual treatments. Every social surface must look unmistakably like Jettison or it has failed.**

If a screen could be screenshotted into a generic-social-app-clone collection without anyone noticing, **it has failed.**

### Social-surface anti-pattern shortlist

Refuse outright:

- Generic blue-corporate-rectangle "What's on your mind?" composer.
- Instagram-style flat 3-column image grid for explore.
- Thumbs-up / heart reactions; emoji-pile reaction bars.
- Red-circle notification badges in the chrome.
- iMessage-style chat bubbles with directional tails.
- Material-Design floating action buttons.
- Gradient-blob "social" landing page.
- Default Mapbox / Google blue map style on the explore tab.

### Seven concrete starting sketches

These are directional sketches, not final specs — the design Bead refines them into a Figma + token-aligned spec. Treat them as the orientation any UI implementation chunk arrives at by default. If a chunk wants to depart, write the reason in `product-engineering.md` first.

1. **Post composer = trip postcard.** Polaroid-vertical aspect, the photo dominant, a short caption in **Fraunces** below, an explicit "tag this to a moment" affordance that links the post to a date or a venue from the trip itinerary. Send/publish copy reads like "**Mail it**" or "**Pin to trip**" — not "Post" and not "Share." (Reserve the verb "jettison" for marketing only — see [`AGENTS.md`](../../../AGENTS.md).)
2. **Feed structured by Trip as the unit of consumption.** Scroll-snap sections, each section headed by the trip name + dates + members, posts grouped under their trip. The trip is the protagonist, not the post. Distinct from every existing flat-firehose social feed and reinforces the brand promise.
3. **Reactions = small custom-illustrated travel-themed glyphs.** Tight set of 3–5 total: e.g. **"I'd join"** (a small pennant), **"save for later"** (a folded map corner), **"wow"** (a sun bursting). Each glyph is a brand asset, drawn by hand or vectorized in the same family as the JTSN monogram. **No emoji, no thumbs-up, no hearts.**
4. **Pending-review state = "your postcard is in the mail."** A small Fraunces-set caption over a stylized stamp/postmark on the placeholder card. Calm, on-brand, plays the moderation latency as part of the product's ritual rather than as friction. The same motif reappears on the **rejection** state ("**returned to sender** — here's why") with the moderator's reason code in plain copy and a link to appeal.
5. **DMs = trip notes.** Each thread is framed as correspondence — Fraunces in the thread header, body in Inter, optional context chip showing which trip (if any) the thread is anchored to. Bubbles are wider, fewer, and more letter-like; **no chat-bubble tail**. Mutual-context gating language reads as warm rather than restrictive: "**You can write to people you both follow, share a trip with, or have a join request with**" — never "blocked" or "denied."
6. **Explore = map-first.** A warm-paper-tinted map (custom Mapbox or MapLibre style in the Jettison palette — **no default Google blue**) with public-trip cards floating as small postcards over their destination pins. Filters are small "stamps" along the bottom (vibe, dates, group size). A toggle to a card-list view exists but is secondary.
7. **Notifications = pennants, not red dots.** A small triangular pennant icon in the chrome with a count badge in **Ember** (the warm clay-orange accent), not bright red. Notification rows are typeset like postcards too — sender's avatar + Fraunces "verb" + Inter context.

### Where this lives in tokens

These social surfaces drive the **content-mode** layout grammar; money-mode (trip detail, payments) keeps the oversized-money-numerals signature unchanged. Both modes share pillars, palette, type, and spacing scale defined in [`app/globals.css`](../../../app/globals.css) `@theme`. Adding a new color, glyph, or motif requires a written reason in `product-engineering.md` first — same rule as before.

### Permission to be creative is explicit

> **When in doubt between a Facebook-shaped solution and a distinctively Jettison-shaped solution, choose the latter and verify usability with a small test. Generic is the failure mode.**

## Pending-review UX

Image moderation introduces three new states the user actually sees. Each has a treatment, a copy register, and a hard rule.

### `pending_media` / `pending_review` (author's view)

- **Visual treatment:** the postcard composer's preview becomes a **stylized stamp/postmark over a soft placeholder**. Card looks intact, just clearly "in transit."
- **Copy:** **"Your postcard is in the mail."** Subhead: **"Posts with photos are reviewed before they go live — usually within 24 hours."** Calm, no apology, no scold.
- **Hard rule:** the image is **invisible to anyone but the author** until approved — including the author's followers, including the trip's other members, including organizers. RLS enforces this; the UI must not pretend otherwise (no "your friends are seeing it now" preview, no "share early" affordance).

### `published`

- **Visual treatment:** standard postcard card — the moderation step is invisible to non-authors. Don't surface "✅ approved" badges.
- **Notification:** the author gets a notification ("**Your postcard arrived.**"), and trip-relevant followers get the standard new-post notification.

### `rejected` (author's view)

- **Visual treatment:** the same stylized stamp, marked **"returned to sender"** with the reason code in plain copy ("Image contains nudity", "Image contains minors", "Image is unrelated to the trip", etc. — fixed code list, no free-form reason).
- **Copy register:** factual + warm, never moralizing. End with an **appeal path** ("If this looks wrong, write us a note — link") — never a dead end.
- **Hard rule:** rejected images stay invisible to everyone but the author and the moderator role. The audit retention window is set in the architecture skill; the UI never references "all rejected images are public."

### Moderator queue UI principles

The moderator queue is **founder-only at MVP** but needs to be **fast** because the founder's time is the binding constraint:

- **Stack-of-cards layout**, one image at a time, with the parent post's caption and trip context above.
- **Keyboard-first triage**: `A` to approve, `R` to reject (then a digit `1-9` for the reason code), `?` for help. Mouse paths exist but are secondary.
- **Reason codes from a small fixed list** (no free-form). Keeps decisions auditable, consistent across moderators, and trainable for the AI auto-classification follow-up.
- **Queue-counter visible at all times** ("**42 postcards waiting**"), so the founder can read the throughput pressure without leaving the queue.
- **Audit-grade**: every decision writes a `moderation_decisions` row with timestamp, moderator, decision, reason code. No silent approvals, no in-place edits.
- **Live-region announcements** (`aria-live="polite"`) when the queue advances, so a screen reader user can triage too.

## Anti-patterns to refuse

- Generic dashboard look (gray cards, default Material/Bootstrap shadows, default rounded buttons).
- "AI slop" landing pages: hero + 3 columns + testimonials, in that order, with a gradient blob.
- Travel-app pastiche (postcards, airplane icons everywhere) used decoratively. (Note: the **postcard motif is intentional** in the social-surface sketches above — it's a deliberate metaphor anchoring composer, pending-review, and DM treatments. Decorative postcard imagery elsewhere is still a refusal.)
- Stripping focus rings to "look clean".
- Ambient color over text without contrast checks.
- All eight items from the **Social-surface anti-pattern shortlist** above.

## Accessibility (beyond tap targets)

Tap targets are in `mobile-web-ui.mdc`. The rest of the floor:

- **Headings** describe a real outline; don't skip levels for visual reasons.
- **Focus order** matches reading order; modals and bottom sheets trap focus and restore it on close.
- **Form errors** are programmatically associated (`aria-describedby`) and surfaced near the field.
- **Color independence** for meaning — don't communicate "owed" only via red.
- **Dialogs** have a label, an accessible name, and an explicit close affordance.
- **Live regions** (`aria-live="polite"`) for async confirmations users need to hear about.
- **Image alt text on every Post.** The post composer **requires** an alt-text field for any uploaded image — empty alt is an explicit user choice ("decorative") gated by a checkbox the user must tick, never the default. Reactions, pending-review stamps, and the JTSN monogram are decorative and use empty `alt=""`. Screen-reader users should be able to read the followers feed without missing what the photo depicts.

## UI copy

The product is **Jettison**. Direction-level identity is locked (see `product-engineering.md` → "Design direction"); the full visual mark (logo, wordmark drawing, favicon) is the next follow-up Bead.

- **Use the name "Jettison"** in welcome screens, share-link copy, marketing pages, transactional emails, and brand voice generally.
- **Do not use "jettison" as a verb in transactional UI.** "Jettison your share" reads as *throw your money away* — exact opposite intent. Use neutral verbs in product flows: **Pay**, **Send**, **Settle**, **Split**, **Collect**.
- The verb form is fine in **marketing voice** ("Jettison the awkward middle", "Jettison the chasing-people part") because the meaning is *shed the burden*, not *throw away money*. Keep the line clean.
- **JTSN** appears only as the secondary mark — favicon, app shortcut, monogram lockups. Never as inline text in product copy.
- Do not pick clever copy that bakes in a personality you'd have to undo later — the Jettison voice should feel **trustworthy + warm**, not party-app and not corporate-fintech.

## Tokens and styles

- Tokens live in the **`@theme` block in [`app/globals.css`](../../../app/globals.css)** (Tailwind v4 idiom). Names map to utility classes — `--color-ink` → `text-ink`, `--font-display` → `font-display`, `--spacing-4` → `p-4`. There is exactly one source of truth.
- **Adding a token:** extend `@theme` in `globals.css`. Don't introduce a parallel token file or a Tailwind config object.
- **Raw hex codes** never live in components. If you need a new shade, add it to `@theme` first — and if it implies a brand decision, explain it in `product-engineering.md` -> "Color" before you ship.
- The hex ramp in `product-engineering.md` -> "Color" and currently in `globals.css` is **direction-level**. The spec-level lock (final ramp with WCAG AA verified per pair, weight + license confirmed) is the follow-up Bead.

## Reviewing a visual change

A visual change is shippable when:

- All four states (happy / empty / loading / error) are designed.
- Contrast and focus are visibly preserved at the smallest target viewport.
- Motion respects reduced-motion.
- It extends an existing pillar/motif, or introduces one **with a written reason** in `product-engineering.md`.
