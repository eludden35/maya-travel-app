---
name: project-orchestration
description: Repository-specific workflow for plan-mode, subagents, verification, and the tasks/todo + tasks/lessons ritual. Use when planning non-trivial work, deciding whether to delegate to a subagent, deciding what counts as proof-of-done, writing or updating tasks/todo.md, capturing a lesson in tasks/lessons.md, or asking "how do we work in this repo?".
---

# Project orchestration

Operating system for humans and agents in this repo. The companion rule is `.cursor/rules/project-workflow.mdc`.

## When to enter Cursor Plan mode

Enter Plan mode if **any** of these are true:

- The work has **3+ steps**.
- It touches **architecture**, **security**, or the **data model** (schema / RLS / auth).
- The spec is **ambiguous** — write the plan to force the ambiguity into the open.

Stay in Plan mode until the user explicitly says to execute. If execution goes wrong, **stop and re-plan** rather than patching forward.

## Subagent strategy

Delegate to a subagent when the task is **bounded** and **independent**:

- **Repo exploration / search** ("where is X used?", "list every place we mutate Y").
- **Research** (library docs, comparison of approaches).
- **Parallel analysis** (run UI, schema, and API checks at once).

Rules:

- **One clear objective per subagent.** Don't pile multiple concerns on one delegated run.
- For hard problems prefer **multiple parallel passes** over one overloaded thread.
- Keep the **main thread for integration and decisions**.

## Self-improvement loop

On any user correction:

1. Append a dated entry to **`tasks/lessons.md`** using the template in that file.
2. If the same pattern has appeared before, **tighten a `.cursor/rules/*.mdc`** rule or **`.cursor/skills/*/SKILL.md`** skill so the same mistake gets harder.
3. Note the rule/skill edit in the lesson's "Followed up by" field.

At session start, when the upcoming task touches an area you have lessons about, **skim `tasks/lessons.md` first** and surface relevant ones in your plan.

## Verification before "done"

Never mark a chunk done without **evidence**:

- Typecheck and targeted tests run and pass.
- Repro steps performed (for bug fixes).
- Visual / manual check (for UI).
- Diff against baseline behavior when relevant.

Ask: **would a staff engineer ship this?** If no, fix or file a Bead.

## `tasks/todo.md` ritual

For the active chunk of work:

1. **Plan** — write the checkable plan in `tasks/todo.md`. Link the active **Bead ID** at the top if one exists.
2. **Verify plan** — pause for user sign-off if they asked for a gate (or the work is high-impact / destructive).
3. **Track** — check items as they complete.
4. **Explain** — short progress summaries in chat as you go (not a wall of internal monologue).
5. **Review** — fill in the **Results / review** section at the end of the chunk: what shipped, evidence, follow-ups (Bead IDs, not free-form TODOs).
6. **Lessons** — if the user corrected you, append to `tasks/lessons.md` per the template there.

`tasks/todo.md` is **session-scoped**. Promote anything long-lived into Beads (`bd create … --discovered-from <id>`) and trim the file rather than letting it grow into a parallel backlog.

## Core principles

- **Simplicity first.** Smallest change that solves the problem.
- **Root causes over band-aids.** No "temporary" hacks as the final state.
- **Minimal blast radius.** Touch only what is necessary.
- **Demand elegance (balanced).** For non-trivial edits, pause once and ask "is there a cleaner shape now?". Skip for trivial one-liners.

## Autonomous bug fixing

On a bug report:

1. **Reproduce** from the user's description.
2. Read **logs / failing tests / error messages** before guessing.
3. **Fix at the root**, not the symptom.
4. **Verify CI is green** before declaring done. Fix failing CI when you see it without waiting to be asked.
