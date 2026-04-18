---
name: project-beads
description: Repo-specific Beads (bd) conventions for issue tracking — labels, epic vs task split, dependency types, dolt server lifecycle, and what is committed vs gitignored. Use when starting work on this repo, creating or updating issues with bd, deciding whether something is a task or an epic, hitting a bd connection error, or asking "how do we use Beads here?". Pairs with the beads-workflow.mdc rule.
---

# Project Beads conventions

**Beads (`bd`)** is the canonical durable issue tracker for this repo. The `beads-workflow.mdc` rule covers behavior every session; this skill covers **repo-specific conventions** and the **server lifecycle quirk** of this install.

## Server lifecycle (important)

The npm-installed `bd` binary on this machine **lacks CGO support**, so the embedded Dolt engine cannot run. We use **Dolt server mode** with a local sql-server.

- **First time per machine session:** `bd dolt start` (brings up the local Dolt server on the port pinned in `.beads/dolt-server.port`).
- **Stop:** `bd dolt stop`.
- **Status:** `bd dolt status`.

If a `bd` command fails with a connection error, run `bd dolt start` and retry. Do **not** edit `.beads/dolt/` by hand — it is Dolt-managed and gitignored.

## Git hygiene (committed vs ignored)

`bd init` already wrote the right `.gitignore` rules. Reference:

| Path | Tracked by git? |
|------|-----------------|
| `.beads/config.yaml`, `.beads/metadata.json`, `.beads/README.md` | **Yes** (team-wide config) |
| `.beads/.gitignore` | **Yes** |
| `.beads/dolt/` | No (Dolt binary store) |
| `.beads/dolt-server.*` (`pid`, `log`, `port`, `lock`) | No (per-machine runtime) |
| `.beads/.beads-credential-key`, `*.lock`, `interactions.jsonl` | No (per-machine / secret) |
| `/.dolt/`, `*.db`, `.beads-credential-key` (root) | No (top-level safety net) |

If you find a Dolt-managed file accidentally staged, **unstage it** rather than tweaking `.gitignore`.

## Title conventions

Format issue titles as `<area>: <imperative phrase>`. Pick **one** primary area per issue from this list (extend deliberately):

- `mobile` — touch-first / responsive concerns
- `ui` — screen, component, or visual work
- `design` — creative direction, tokens, motion, type
- `supabase` — schema, RLS, auth, types
- `payments` — money flow, webhooks, idempotency
- `payouts` — venue / organizer payout flow
- `domain` — terminology, model changes
- `infra` — env, CI, deploys
- `docs` — context, AGENTS.md, skills, rules
- `bug` — defect tracking
- `chore` — maintenance / cleanup

```
ui: organizer dashboard — "who hasn't paid" is the primary view at narrow widths
supabase: add expenses table with RLS for trip members
```

Use **labels** (`bd label`) for cross-cutting tags (`mvp`, `post-mvp`, `security`, `accessibility`).

## Epics vs tasks

- **Epic** when there is a coherent user-visible outcome that needs **multiple** independently shippable steps. Create the epic with `bd epic` (or `bd create --type epic`) and link children with `--parent`.
- **Task** for a single shippable change.
- Don't create epics for two-step work — just file a task and let it close cleanly.

## Dependency types we use

- `--blocks` / `--blocked-by` — strict ordering.
- `--parent` — child of an epic.
- `--discovered-from` — work surfaced while doing something else; this preserves provenance instead of leaving free-floating `TODO` comments.

```bash
bd create --type task --title "ui: split-amount keyboard" --json
bd create --type task --title "ui: custom-split editor" --discovered-from <id> --json
```

## Daily commands (cheat sheet)

```bash
bd ready                       # unblocked work for today
bd list --json                 # full list (machine-readable)
bd show <id> --json            # details
bd create --type task --title "..." --json
bd update <id> --priority p1
bd close <id>
```

Prefer `--json` whenever an agent (or a script) is consuming the output.

## Discovered work — file it, don't comment it

If you notice a follow-up while shipping a chunk:

- **`bd create … --discovered-from <current-id>`** — durable, linked, scheduled.
- ❌ Do not leave `// TODO:` in the diff and walk away.
- ❌ Do not append to `tasks/todo.md` for items that outlive the current chunk.

## tasks/todo.md vs Beads (reminder)

`tasks/todo.md` is the **session execution transcript** for the **current chunk** — checkbox plan, progress, review. **Beads** holds durable state. Link bead ↔ session plan; do not maintain two competing backlogs.

## Reference

Upstream CLI docs: <https://github.com/steveyegge/beads>. Treat them as the source of truth for command flags; this skill captures only what is **specific to this repo**.
