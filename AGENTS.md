# AGENTS

Single entry point for humans and AI agents working in this repo.

## Product

- **Public product name: Jettison.** Name-of-record in code, copy, and metadata is the full word **Jettison**. The stylized abbreviation **`JTSN` is the secondary mark** — used for tight surfaces (favicon, app shortcut, social avatar, monogram lockups) where the full wordmark won't read. It is **not** the primary wordmark.
- **Positioning (one-liner):** _Jettison is the social network for group travel — discover trips worth joining with the people you actually know, plan them together, and split the money so no one fronts the bill._
- **Naming notes:** Repo folder `maya-travel-app` and Beads issue prefix `tripplanner` are **legacy / internal** — both are scheduled to be renamed (see follow-up Beads from `tripplanner-a8c`). Do not let them leak into user-facing surfaces. Never use the verb "jettison" in transactional UI copy ("Jettison your share" reads as *throw it away*); reserve the verb for marketing only.
- **Vision pivot (2026-04-18):** Jettison is now framed as **a social network for group travel with payments built in**, not a transactional payments app with social bolted on. Recorded in [`docs/adr/0002-social-vision-pivot.md`](docs/adr/0002-social-vision-pivot.md). Read that ADR before scoping anything in the social surface — it carries the moderation hard-rules and the Phase 2 gate criteria.
- **MVP scope (social-first):**
  - Profiles (handle, display name, avatar, bio) and asymmetric follow graph.
  - Trip visibility model (`private` | `unlisted` | `public`) — public trips appear in the explore feed and accept join requests (approval-required by default).
  - In-trip Posts (text + photos), comments, reactions; followers feed (chronological); explore tab (recent + popular, no algorithm).
  - DMs with **mutual-context gating** (mutual-follow OR shared trip OR open join request — no cold DMs from strangers).
  - **Strict pre-moderation on every uploaded image:** EXIF GPS strip → CSAM scan → manual moderator review → publish. No image is visible to anyone but the uploader until approved. Founder-triaged at MVP via a lightweight admin queue UI; AI auto-classification is a P1 follow-up that raises throughput, never lowers the safety floor.
  - Notifications (new follower, post published, post rejected, comment, reaction, payment received, join request, new DM).
  - Block + mute + report primitives; rate limiting on writeable surfaces.
  - The original payments flow: create trip → add people → add costs → everyone pays their share → money flows to organizer or venue.
- **Money privacy hard rule:** money data (`expenses`, `expense_shares`, `payouts`, anything monetary) is **never** readable by non-trip-members regardless of trip visibility, follower relationship, or any other social grant. Public trips show itinerary, photos, and posts — never amounts.
- **Out of scope (MVP):** BNPL, native mobile clients (Expo/React Native), vendor onboarding marketplace UX, stories/ephemeral content, live video, influencer monetization, algorithmic feed ranking. Lawyer-reviewed ToS and 24/7 trust & safety ops are **deferred to Phase 2** with explicit MAU gates (5k / 25k) recorded in ADR 0002.

## Delivery

- **Mobile-first web app.** Phone viewports first; tablet/desktop are progressive enhancement.
- **Design quality bar: exceptionally creative and visually distinctive** — not interchangeable template SaaS or generic AI-default aesthetics. Creativity must coexist with usability, contrast, and accessibility. See [`.cursor/rules/project-creative-design.mdc`](.cursor/rules/project-creative-design.mdc) and the `project-ui-ux` skill.

## Stack

Locked in [`docs/adr/0001-framework-choice.md`](docs/adr/0001-framework-choice.md):

- **Backend:** Supabase — Auth, Postgres, **Row-Level Security (RLS)**.
- **Web framework:** **Next.js 16 App Router** (TypeScript, strict). Docs for the installed version ship in `node_modules/next/dist/docs/`. Check an API there before you use it, since it may have changed since your training data. `agentRules: false` in [`next.config.ts`](next.config.ts) stops `next dev` from writing its own block into this file.
- **Server-side auth:** **`@supabase/ssr`** + `@supabase/supabase-js`. Cookie-based sessions; [`proxy.ts`](proxy.ts) (Next.js 16 — formerly `middleware.ts`) refreshes on every request. See [`lib/supabase/{server,client,middleware}.ts`](lib/supabase/).
- **Styling + tokens:** **Tailwind CSS v4** with the `@theme` block in [`app/globals.css`](app/globals.css) as the single source of truth for design tokens (warm palette, type ramp, spacing scale).
- **Type system:** Fraunces (display) + Inter (text) + JetBrains Mono (money tables only) — loaded via `next/font/google` in [`app/layout.tsx`](app/layout.tsx).
- **Hosting:** **Vercel** (preview URLs per branch).
- **Runtime + package manager:** **Node 24** ([`.nvmrc`](.nvmrc)) and **pnpm 11** (`packageManager` in [`package.json`](package.json)).
- **Environments (2026-10-29):** local Supabase in Docker (`supabase start`) for development. The hosted project `jettison` (`siaygwtwgvgjoircgpoa`) is **UAT**: test data only, invite-only via `private.onboarding_allowlist`. Production gets a new project at launch.
- **Tests / CI (2026-10-29):** **Vitest** (unit, `lib/**/*.test.ts`), **pgTAP** ([`supabase/tests/database/`](supabase/tests/database/), `supabase test db`) and **Playwright** (mobile smoke in [`e2e/`](e2e/), sign-in codes read from the local Mailpit inbox). [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs all three plus `pnpm check:secrets` on every PR. It applies migrations to UAT on `main` once the `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` repo secrets exist; after that, nobody pushes migrations from a laptop.
- **Errors:** **Sentry** (`@sentry/nextjs`), on only when `NEXT_PUBLIC_SENTRY_DSN` is set. SDK 11 ignores `sendDefaultPii`, so [`lib/sentry-options.ts`](lib/sentry-options.ts) sets `dataCollection` and scrubs every event: no IP address, email address, cookie, request body or query string reaches Sentry (UAT entry E4).

For App Router conventions (Server Components default, Server Actions, Route Handlers, and the hard rule against `SUPABASE_SECRET_KEY` in client-bundled modules), see [`.cursor/rules/typescript-react.mdc`](.cursor/rules/typescript-react.mdc). For deep Supabase patterns, read the workspace **Supabase skill** before changing schema or auth code.

## Issue tracking — Beads (`bd`)

- **Beads (`bd`)** is the canonical durable issue tracker for this repo. Issues live git-backed under `.beads/`.
- **Install (pinned):** `brew install beads` on macOS; upstream curl script as a Linux/CI fallback.
- **Version (pinned):** **`bd` 0.63.x**, Dolt server mode. If `bd` reports the Dolt server unreachable, run `bd dolt start` (`bd dolt status` to check).
- **Daily commands:** `bd ready` (unblocked work), `bd create … --json`, `bd show <id> --json`, `bd update --claim`. Prefer `--json` for any scripted/agent use.
- **Known `bd` caveat:** `bd ready` currently surfaces issues that are explicitly `blocked-by` an open issue (cache/derived-fields bug — tracked as `tripplanner-3uu`). Treat `bd dep list <id>` and the `dependencies` array on `bd show --json` as the source of truth for what is actually blocked; do not rely on `bd ready` alone when a blocker has been declared.
- **Do not** create a root `TODO.md` or any other ad-hoc backlog file. The only blessed markdown task surface is [`tasks/todo.md`](tasks/todo.md) (session scratchpad — see below).

## Session workflow

- **Plan first.** Use Cursor Plan mode for any non-trivial task (3+ steps, or architectural / security / data-model decisions).
- **Per-chunk task file:** [`tasks/todo.md`](tasks/todo.md) — checkable plan, progress, and a short Review section. Link the active Bead ID at the top when applicable.
- **Lessons:** [`tasks/lessons.md`](tasks/lessons.md) — append a dated pattern + fix after every user correction. If a mistake repeats, tighten a Cursor rule or skill.
- **Proof before "done":** evidence (typecheck, tests, logs, repro) is required before marking work complete. For a migration, typecheck, lint and a clean `db push` are not proof: pgTAP tests must exercise its policies as anon and as two signed-in users (`supabase test db`). See [`.cursor/rules/project-workflow.mdc`](.cursor/rules/project-workflow.mdc) and the `project-orchestration` skill.

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
- UAT-1 test plan (epic `tripplanner-2o5`): [`docs/uat/uat-1-test-plan.md`](docs/uat/uat-1-test-plan.md)
- Always-on rules: [`.cursor/rules/`](.cursor/rules/)
- Project skills: [`.cursor/skills/`](.cursor/skills/)
