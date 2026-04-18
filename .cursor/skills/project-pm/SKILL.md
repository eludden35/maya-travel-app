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
```

If you cannot write a testable acceptance line, the spec is not ready — **stop and clarify** with the user (or in the plan).

## Beads mapping

- Each acceptance bullet → a Beads task (or several), with `--parent` pointing at the chunk's epic when there is one.
- Use `--blocks` / `--blocked-by` for ordering; use `--discovered-from` for follow-ups surfaced mid-implementation.
- Title format: `<area>: <imperative phrase>` (see the `project-beads` skill for the area list).

## MVP fit (the gate)

For **every** proposed feature, ask:

- Does this advance the MVP loop **trip → people → costs → split → pay**?
- If we cut this for the next 4 weeks, does the MVP still ship?

If the answer to the first is **no**, file it as a Beads issue with label `post-mvp` and move on. If the answer to the second is **yes**, default to cut.

## Cutting scope without losing the core

When a chunk is too big, look for cuts in this order:

1. **Edge cases** — handle the 90% path; add a Beads issue for the rest.
2. **Configurability** — ship one good default; add settings later.
3. **Polish surface** — empty/error/loading states are not optional; "cosmetic delight" can be a follow-up.
4. **Scope of who it serves** — organizer-only first, participant later (or vice versa).

Never cut **security** (auth, RLS, secret boundaries) or **money correctness** (numeric precision, idempotency) to ship faster.

## Open decisions to keep visible

These are tracked as Beads epics/tasks until closed; surface them in PM conversations:

- **Choose the web framework** (recommended baseline: Next App Router); first ADR.
- **Choose the payment provider** and country/currency scope.
- **Choose styling solution + token location.**
- **Choose test runner and CI surface.**
- **Visual identity for Jettison** (logo, wordmark, palette, JTSN treatment) — follow-up of `tripplanner-a8c`.
- **Rename repo folder + npm package + Beads prefix** to align with the Jettison brand — follow-ups of `tripplanner-a8c`.

Don't let these drift. If a chunk depends on one of them, **block** the chunk on the open decision and escalate.

The **public product name** is settled — it's **Jettison** (recorded in `AGENTS.md`). Do not re-litigate.

## Output format (for chat)

When closing a PM-lens pass, summarize as:

```
Problem · IN · OUT · Acceptance · Beads (epic + tasks) · Open decisions touched
```

Short, scannable, decision-ready.
