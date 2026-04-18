---
name: project-code-review
description: Code-review lens for this repo — structured review across correctness, security (especially auth, payments, PII), maintainability, tests, and performance, with a clear output format and Bead linkage. Use before declaring a non-trivial change done, when reviewing a PR or diff, when the user asks for a code review, or when wrapping up a chunk and writing the Review section in tasks/todo.md. Pairs with the project-review-checklist-ts.mdc and project-review-checklist-sql.mdc rules.
---

# Project code review

This skill expresses the **code-review lens** from `project-team-lenses.mdc`. The `.mdc` review rules are the **gate** (mandatory checklist when touching globs); this skill is the **method** (how to think and how to write the review).

## When to invoke

- Before opening or merging a PR.
- Before marking a chunk done in `tasks/todo.md`.
- When the user says "review this", "look at this diff", or asks for a security/perf pass.

## Approach

Walk the diff once for each lens below. For each finding, note **which file/line** and **why it matters** — never "looks good" without evidence.

### 1. Correctness

- Does the code do what the chunk's acceptance criteria say?
- Edge cases: empty inputs, zero-amount expenses, members removed mid-trip, currencies that don't match, network errors mid-flow.
- Async paths handle rejection; promises are awaited where the result matters.
- No silent `any`/`unknown` on data crossing trust boundaries (DB rows, API payloads, user input).

### 2. Security (heightened bar — money + PII)

Pay extra attention here:

- **Auth boundary.** Any code path that mutates user data must be scoped to the right user under RLS or guarded server-side. Never trust client-supplied IDs (`organizerId` in a request body) without re-deriving from `auth.uid()`.
- **Service role.** `SUPABASE_SERVICE_ROLE_KEY` (and any other secret) lives only server-side. No `"use client"` import path leads to it.
- **Payments.** Webhook handlers verify signatures, dedupe on idempotency keys, and never trust amounts from the client — server re-fetches from the provider.
- **PII.** Don't log emails, full names, payment identifiers, or full webhook bodies. Redact or omit.
- **Migrations.** RLS enabled in the same migration; policies tight; no `using (true)` on user data; FKs have an explicit `on delete` that matches intent.

### 3. Maintainability

- Names match the domain (`Trip`, `Member`, `Expense`, `Share`, `Payout` — see `project-domain`).
- Functions are focused; no 200-line god-functions.
- Side effects are obvious from the call site, not buried.
- Existing patterns reused over inventing new ones — surface the deviation if you must invent.

### 4. Tests

The bar scales with risk:

| Risk | Required evidence |
|------|-------------------|
| **Money math, RLS policy, auth flow, webhook handler** | Targeted automated tests **must** exist and pass. |
| **Domain logic with branches** | Targeted tests for the branches. |
| **Pure UI restyle** | Manual repro / screenshot is acceptable when no test runner exists yet; promote to a test once one is chosen. |
| **Trivial copy/typo** | Spot check; no test required. |

If the test runner has not been chosen yet, document the **manual** verification clearly in `tasks/todo.md` Review.

### 5. Performance

- No N+1 queries (joins or batched fetches over loops).
- No unbounded list rendering without pagination/virtualization plan.
- No large libraries pulled into the client bundle for trivial use (e.g. importing a date library to format one timestamp).
- Server-rendered paths don't fan out to many sequential awaits when they could parallelize.

## Output format

Prefer this structure when writing the review:

```markdown
## Summary
One paragraph: what changed, what risk class it falls into.

## Blocking
- 🔴 file:line — what's wrong, why it blocks, suggested fix (or Bead ID if filed).

## Suggestions
- 🟡 file:line — improvement that isn't blocking.

## Nice to have
- 🟢 file:line — optional polish.

## Verified
- Acceptance bullets walked: ✅ / ❌
- Tests run: <command + result>
- Manual repro: <steps if applicable>
```

Use **Bead IDs** for any non-blocking finding that won't be fixed in this chunk — don't drop them on the floor.

## When closing a chunk

For the `tasks/todo.md` Review section, paste:

- Lenses applied (Architecture / PM / UI/UX / Code review — which ones).
- Evidence (commands run, screenshots, repro).
- Follow-ups as **Bead IDs** (not free-form TODOs).
- A pointer to `tasks/lessons.md` if you appended a lesson.

No "done" without that section filled in.
