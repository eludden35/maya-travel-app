# AGENTS

Single entry point for humans and AI agents working in this repo.

## Product

- **Public product name: Jettison.** Name-of-record in code, copy, and metadata is the full word **Jettison**. The stylized abbreviation **`JTSN` is the secondary mark** — used for tight surfaces (favicon, app shortcut, social avatar, monogram lockups) where the full wordmark won't read. It is **not** the primary wordmark.
- **Positioning (one-liner):** _Jettison is the mobile-first way for groups to plan, split, and settle shared trips and events — so no one fronts the money or chases anyone afterward._
- **Naming notes:** Repo folder `maya-travel-app` and Beads issue prefix `tripplanner` are **legacy / internal** — both are scheduled to be renamed (see follow-up Beads from `tripplanner-a8c`). Do not let them leak into user-facing surfaces. Never use the verb "jettison" in transactional UI copy ("Jettison your share" reads as *throw it away*); reserve the verb for marketing only.
- **MVP scope:** create trip → add people → add costs → everyone pays their share → money flows to organizer or venue.
- **Out of scope (MVP):** social feed, public trips, BNPL, native mobile clients (Expo/React Native).

## Delivery

- **Mobile-first web app.** Phone viewports first; tablet/desktop are progressive enhancement.
- **Design quality bar: exceptionally creative and visually distinctive** — not interchangeable template SaaS or generic AI-default aesthetics. Creativity must coexist with usability, contrast, and accessibility. See [`.cursor/rules/project-creative-design.mdc`](.cursor/rules/project-creative-design.mdc) and the `project-ui-ux` skill.

## Stack

Locked in [`docs/adr/0001-framework-choice.md`](docs/adr/0001-framework-choice.md):

- **Backend:** Supabase — Auth, Postgres, **Row-Level Security (RLS)**.
- **Web framework:** **Next.js 16 App Router** (TypeScript, strict).
- **Server-side auth:** **`@supabase/ssr`** + `@supabase/supabase-js`. Cookie-based sessions; [`proxy.ts`](proxy.ts) (Next.js 16 — formerly `middleware.ts`) refreshes on every request. See [`lib/supabase/{server,client,middleware}.ts`](lib/supabase/).
- **Styling + tokens:** **Tailwind CSS v4** with the `@theme` block in [`app/globals.css`](app/globals.css) as the single source of truth for design tokens (warm palette, type ramp, spacing scale).
- **Type system:** Fraunces (display) + Inter (text) + JetBrains Mono (money tables only) — loaded via `next/font/google` in [`app/layout.tsx`](app/layout.tsx).
- **Hosting:** **Vercel** (preview URLs per branch).
- **Package manager:** **pnpm**.
- **Test runner / CI:** TBD post-scaffold (default recommendation: Vitest; Vercel checks or GitHub Actions). Tracked in Beads.

For App Router conventions (Server Components default, Server Actions, Route Handlers, and the hard rule against `SUPABASE_SERVICE_ROLE_KEY` in client-bundled modules), see [`.cursor/rules/typescript-react.mdc`](.cursor/rules/typescript-react.mdc). For deep Supabase patterns, read the workspace **Supabase skill** before changing schema or auth code.

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

- **Cursor artifacts** under `.cursor/rules/` and `.cursor/skills/` use the **`project-`** filename prefix (deliberately neutral, independent of the product brand "Jettison" so a future rename or rebrand is cheap).
- **Architecture Decision Records (ADRs):** `docs/adr/NNNN-title.md`, sequential and dated; status one of Proposed / Accepted / Superseded.
- **Supabase migrations** are the source of truth for schema. RLS ships in the same migration as the table.

## Where to look first

- Product narrative: [`app-context/initial-app-idea.md`](app-context/initial-app-idea.md)
- Engineering glossary + boundaries: [`app-context/product-engineering.md`](app-context/product-engineering.md)
- Always-on rules: [`.cursor/rules/`](.cursor/rules/)
- Project skills: [`.cursor/skills/`](.cursor/skills/)
