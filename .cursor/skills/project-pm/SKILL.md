---
name: project-pm
description: Product-management lens for this repo — scope discipline, problem statements, IN/OUT framing, testable acceptance criteria, Beads mapping, scope cutting, and tracking the open foundational decisions (framework, payments, styling, test/CI, repo + Beads renames to align with the Jettison brand). Use when starting a new feature or chunk, deciding whether something belongs in MVP, writing acceptance criteria, splitting work into Beads issues, or pushing back on scope creep.
---

# Project PM

This skill expresses the **PM lens** from `project-team-lenses.mdc`. Use it before architecture and code on anything that introduces user-visible behavior.

## Frame every chunk

Write these four lines (in chat or in `tasks/todo.md`) **before** planning steps:

1. **Problem.** What user pain or organizer pain is this solving, in one sentence?
2. **IN this increment.** The minimum that delivers the user-visible outcome.
3. **OUT (explicit).** What we are deliberately not doing in this chunk — protect against scope creep.
4. **Acceptance.** The testable conditions that say "done".

```markdown
- Problem: organizers can't tell who still owes for a trip on their phone.
- IN: a "Who hasn't paid" view sorted by amount owed; tap to nudge.
- OUT: in-app chat, scheduled reminders, partial payments.
- Acceptance:
  - On a 360 px viewport, the list is the primary view (no horizontal scroll).
  - Each row shows member, amount owed, and a Nudge action ≥ 44 px tall.
  - Members who owe $0 are excluded.
  - The list updates within 2 s after a payment is recorded.
  - The view is members-only — non-members of the trip get a 404, never a "you can't see this" empty state that would leak existence.
```

A social-side example:

```markdown
- Problem: members of a trip can't share trip moments without leaving the app.
- IN: an in-trip Post composer (text + 1 photo); photo enters the moderation pipeline; "your postcard is in the mail" pending state on the author's view.
- OUT: video, multi-photo carousels, post-publish editing, comments (separate Bead).
- Acceptance:
  - Photo upload strips EXIF GPS server-side before any persistence.
  - Photo lands in the private `pending/` storage path; post row sits at `pending_media`; only the author sees the post.
  - On approval, post flips to `published` and is visible to the trip's audience per visibility (members for `private`/`unlisted`, world for `public`).
  - The composer copy reads "Pin to trip" / "Mail it", **never** "Post" or "Share".
  - The pending state visual treatment matches the "in the mail" sketch in `project-ui-ux` → "Social surfaces".
```

If you cannot write a testable acceptance line, the spec is not ready — **stop and clarify** with the user (or in the plan).

## Beads mapping

- Each acceptance bullet → a Beads task (or several), with `--parent` pointing at the chunk's epic when there is one.
- Use `--blocks` / `--blocked-by` for ordering; use `--discovered-from` for follow-ups surfaced mid-implementation.
- Title format: `<area>: <imperative phrase>` (see the `project-beads` skill for the area list).

## MVP fit (the gate)

Per [`docs/adr/0002-social-vision-pivot.md`](../../../docs/adr/0002-social-vision-pivot.md), Jettison's MVP is now **social-first**: the loop is no longer just "trip → people → costs → split → pay" but a coupled product where **payments and the social graph land together**. For every proposed feature, ask:

- Does this advance one of the two MVP loops?
  1. **Money loop:** trip → people → costs → split → pay.
  2. **Social loop:** profile → follow → in-trip post (pre-moderated) → feed/explore → join request → DM (mutual-context only).
- Does it respect the **money privacy hard rule** (no monetary data exposed to non-trip-members regardless of social grant)?
- Does it respect the **image pre-moderation hard rule** (no uploaded image visible to anyone but the uploader until approved)?
- If we cut this for the next 4 weeks, does the MVP still ship?

If the answer to the first is **no**, file it as a Beads issue with label `post-mvp` (or `phase-2` if it's deferred per the ADR's gate criteria) and move on. If the answer to the last is **yes**, default to cut. The two hard rules are non-negotiable — never trade them for speed.

### Phase 2 (deferred behind explicit gates)

Don't pull these forward without re-opening ADR 0002:

- Lawyer-reviewed ToS / Community Guidelines / privacy policy — gate: 5,000 MAU OR first material abuse incident.
- 24/7 trust & safety operating model — gate: 25,000 MAU OR ToS lawyer recommends earlier.
- Algorithmic feed ranking — gate: chronological hurting retention.
- Stories / ephemeral content, live video, influencer monetization tools — no hard gate; re-evaluate.

## Cutting scope without losing the core

When a chunk is too big, look for cuts in this order:

1. **Edge cases** — handle the 90% path; add a Beads issue for the rest.
2. **Configurability** — ship one good default; add settings later.
3. **Polish surface** — empty/error/loading states are not optional; "cosmetic delight" can be a follow-up.
4. **Scope of who it serves** — organizer-only first, participant later (or vice versa).

Never cut **security** (auth, RLS, secret boundaries) or **money correctness** (numeric precision, idempotency) to ship faster.

## Open decisions to keep visible

These are tracked as Beads epics/tasks until closed; surface them in PM conversations:

- **Choose the payment provider** and country/currency scope.
- **Choose test runner and CI surface.**
- **Visual identity for Jettison** (logo, wordmark, palette, JTSN treatment) — follow-up of `tripplanner-a8c`.
- **Rename repo folder + npm package + Beads prefix** to align with the Jettison brand — follow-ups of `tripplanner-a8c`.
- **CSAM-scanning vendor** (Sightengine / Hive / PhotoDNA partner) — chosen by the CSAM-integration implementation Bead.
- **AI auto-classification vendor + decision threshold** — chosen by the AI auto-classification follow-up Bead.
- **Moderator-queue scaling plan** beyond the founder — when do we hire a contract moderator; tracked under the Phase 2 epic.

Don't let these drift. If a chunk depends on one of them, **block** the chunk on the open decision and escalate.

### Resolved decisions (don't re-litigate)

- **Public product name**: **Jettison** (recorded in `AGENTS.md`).
- **Web framework**: Next.js 16 App Router + TypeScript + Tailwind v4 + `@supabase/ssr` + Vercel — locked in [`docs/adr/0001-framework-choice.md`](../../../docs/adr/0001-framework-choice.md).
- **Styling solution + token location**: Tailwind v4 + `@theme` block in `app/globals.css` — closed by ADR 0001.
- **Product vision (social-first vs transactional-only)**: social-first — locked in [`docs/adr/0002-social-vision-pivot.md`](../../../docs/adr/0002-social-vision-pivot.md). Don't re-open without writing an ADR superseding 0002.

## Output format (for chat)

When closing a PM-lens pass, summarize as:

```
Problem · IN · OUT · Acceptance · Beads (epic + tasks) · Open decisions touched
```

Short, scannable, decision-ready.
