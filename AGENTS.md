# AGENTS

Single entry point for humans and AI agents working in this repo.

## Product

- **Public product name: TBD.** The repo folder is `maya-travel-app` (filesystem convenience) and `package.json#name` may mirror it, but the **launch brand is independent and not yet chosen** — see [`app-context/initial-app-idea.md`](app-context/initial-app-idea.md) for positioning notes.
- **One-liner (neutral):** A mobile-first web app for organizing group trips, splitting shared costs, and sending payments to organizers or directly to venues.
- **MVP scope:** create trip → add people → add costs → everyone pays their share → money flows to organizer or venue.
- **Out of scope (MVP):** social feed, public trips, BNPL, native mobile clients (Expo/React Native).

## Delivery

- **Mobile-first web app.** Phone viewports first; tablet/desktop are progressive enhancement.
- **Design quality bar: exceptionally creative and visually distinctive** — not interchangeable template SaaS or generic AI-default aesthetics. Creativity must coexist with usability, contrast, and accessibility. See [`.cursor/rules/project-creative-design.mdc`](.cursor/rules/project-creative-design.mdc) and the `project-ui-ux` skill.

## Stack

- **Backend (locked):** Supabase — Auth, Postgres, **Row-Level Security (RLS)**.
- **Web framework / styling / hosting:** **TBD.** Recommended baseline when ready: **Next.js App Router + TypeScript + Tailwind CSS + `@supabase/ssr` + Vercel.** Alternate: **Vite + React Router + TypeScript + Supabase** (SPA, no SSR). Decision will land in `docs/adr/0001-framework-choice.md` and be recorded here.
- **Test runner / CI:** TBD post-scaffold (default recommendation: Vitest; Vercel checks or GitHub Actions).

For deep Supabase patterns (Auth, Postgres, RLS, SSR), read the workspace **Supabase skill** before changing schema or auth code.

## Issue tracking — Beads (`bd`)

- **Beads (`bd`)** is the canonical durable issue tracker for this repo. Issues live git-backed under `.beads/`.
- **Install (pinned):** `brew install beads` on macOS; upstream curl script as a Linux/CI fallback.
- **Version major:** TBD on first run — pin **either** `bd` 0.49.x **or** 0.50+ (Dolt-backed) here once chosen, and stick with it.
- **Daily commands:** `bd ready` (unblocked work), `bd create … --json`, `bd show <id> --json`, `bd update --claim`. Prefer `--json` for any scripted/agent use.
- **Do not** create a root `TODO.md` or any other ad-hoc backlog file. The only blessed markdown task surface is [`tasks/todo.md`](tasks/todo.md) (session scratchpad — see below).

## Session workflow

- **Plan first.** Use Cursor Plan mode for any non-trivial task (3+ steps, or architectural / security / data-model decisions).
- **Per-chunk task file:** [`tasks/todo.md`](tasks/todo.md) — checkable plan, progress, and a short Review section. Link the active Bead ID at the top when applicable.
- **Lessons:** [`tasks/lessons.md`](tasks/lessons.md) — append a dated pattern + fix after every user correction. If a mistake repeats, tighten a Cursor rule or skill.
- **Proof before "done":** evidence (typecheck, tests, logs, repro) is required before marking work complete. See [`.cursor/rules/project-workflow.mdc`](.cursor/rules/project-workflow.mdc) and the `project-orchestration` skill.

## Virtual software team (perspectives, not personas)

For non-trivial work, intentionally apply four lenses:

- **Architecture** — see `project-architecture` skill.
- **Product management (PM)** — see `project-pm` skill.
- **UI/UX (with creative direction)** — see `project-ui-ux` skill.
- **Code review** — see `project-code-review` skill.

These are perspectives to think through, not separate chat personas, unless you explicitly ask for a staged review.

## Repository conventions

- **Cursor artifacts** under `.cursor/rules/` and `.cursor/skills/` use the **`project-`** filename prefix so tooling is not confused with the (TBD) product brand.
- **Architecture Decision Records (ADRs):** `docs/adr/NNNN-title.md`, sequential and dated; status one of Proposed / Accepted / Superseded.
- **Supabase migrations** are the source of truth for schema. RLS ships in the same migration as the table.

## Where to look first

- Product narrative: [`app-context/initial-app-idea.md`](app-context/initial-app-idea.md)
- Engineering glossary + boundaries: [`app-context/product-engineering.md`](app-context/product-engineering.md)
- Always-on rules: [`.cursor/rules/`](.cursor/rules/)
- Project skills: [`.cursor/skills/`](.cursor/skills/)
