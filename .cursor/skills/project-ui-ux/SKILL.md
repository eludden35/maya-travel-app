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

## Anti-patterns to refuse

- Generic dashboard look (gray cards, default Material/Bootstrap shadows, default rounded buttons).
- "AI slop" landing pages: hero + 3 columns + testimonials, in that order, with a gradient blob.
- Travel-app pastiche (postcards, airplane icons everywhere) used decoratively.
- Stripping focus rings to "look clean".
- Ambient color over text without contrast checks.

## Accessibility (beyond tap targets)

Tap targets are in `mobile-web-ui.mdc`. The rest of the floor:

- **Headings** describe a real outline; don't skip levels for visual reasons.
- **Focus order** matches reading order; modals and bottom sheets trap focus and restore it on close.
- **Form errors** are programmatically associated (`aria-describedby`) and surfaced near the field.
- **Color independence** for meaning — don't communicate "owed" only via red.
- **Dialogs** have a label, an accessible name, and an explicit close affordance.
- **Live regions** (`aria-live="polite"`) for async confirmations users need to hear about.

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
