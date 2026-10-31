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

## Parallel chunks (≥2 chunks shipped concurrently by subagents)

When the user asks for parallel chunks (or you propose them), follow this contract — it is the load-bearing piece, not a nice-to-have. Lesson [`tasks/lessons.md` 2026-04-19](../../../tasks/lessons.md) is the canonical case study.

1. **Strict file-scope contract per chunk.** Each subagent gets two explicit lists in its prompt: **OWNS** (files it may create or modify) and **MUST NOT TOUCH** (everything else, plus an explicit call-out for `supabase/migrations/*` files that already exist — those are immutable). Zero file overlap across chunks. If two chunks both want the same file, sequence them; do not parallelize them.
2. **Pre-allocate migration timestamps** before launching subagents so the parallel migrations cannot collide on filenames. Example: `20260419190000_chunk_a.sql`, `20260419190100_chunk_b.sql`, `20260419190200_chunk_c.sql` — keep them strictly increasing in the order the parent agent will push them.
3. **Subagents stop before orchestration.** They implement, run local `pnpm tsc --noEmit` + `pnpm lint`, and report back. They do **not** run `supabase db push`, do **not** regenerate `database.types.ts`, do **not** create commits. The parent agent sequences those steps **once**, in dependency order, after every subagent has reported back. Concurrent `db push` or concurrent type-regen would corrupt shared state.
4. **Temp-type workarounds get removed in the same orchestration pass that regenerates types.** If a subagent needed a local type-narrowing cast or `AugmentedDatabase` to type-check before its migration's types existed, the parent agent removes those workarounds *immediately after* type regeneration and re-runs `tsc + lint` before committing. Never carry a temp-type cast into a commit.
5. **File honest-deferrals as real Beads with `--blocked-by` linkage.** When a chunk's AC has lines that must be deferred because they would have overlapped files with a parallel chunk in flight, file a follow-up Bead with `--blocked-by` pointing at the chunk that surfaced the deferral, and `--discovered-from` pointing at the chunk that surfaced it. Append mirroring notes to any downstream Beads that the deferred wiring will eventually have to honor.
6. **Three-way split of `database.types.ts`.** When ≥2 parallel chunks add to the same regenerated `database.types.ts`, split the diff across commits using `git add -p`. Each commit's checkout must `tsc` cleanly in isolation — the table types and function signatures a chunk's `lib/*` modules consume must land in the same commit as those modules.
7. **Commit one chunk at a time, in dependency order.** If chunk B's policy extension supersedes a `TODO(chunk-B)` marker that chunk A left in a historical migration, B's commit lands after A's. The historical migration file is **never** modified — close the seam in B's new migration via `drop policy / create policy`.
8. **Pre-allocate shared mutable files in a prep commit.** When two chunks both need to add an entry to the same list-shaped file (a constants table, registry, route list, env template), the parent agent adds both entries first; subagents only consume them ([`tasks/lessons.md` 2026-04-20](../../../tasks/lessons.md)).

## Self-improvement loop

On any user correction:

1. Append a dated entry to **`tasks/lessons.md`** using the template in that file.
2. If the same pattern has appeared before, **tighten a `.cursor/rules/*.mdc`** rule or **`.cursor/skills/*/SKILL.md`** skill so the same mistake gets harder.
3. Note the rule/skill edit in the lesson's "Followed up by" field.

At session start, when the upcoming task touches an area you have lessons about, **skim `tasks/lessons.md` first** and surface relevant ones in your plan.

## Verification before "done"

Never mark a chunk done without **evidence**:

- Typecheck and targeted tests run and pass: `pnpm typecheck`, `pnpm lint`, `pnpm test`, and for database work `supabase test db`.
- For a user-facing flow, the Playwright smoke (`pnpm test:e2e`) passes against the local stack.
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
