# Jettison

> Jettison is the social network for group travel — discover trips worth joining with the people you actually know, plan them together, and split the money so no one fronts the bill.

Mobile-first web app. Public product name **Jettison**; the repo folder name (`maya-travel-app`) and the Beads issue prefix (`tripplanner`) are **legacy/internal** and scheduled to be renamed.

## Stack

Locked in [`docs/adr/0001-framework-choice.md`](docs/adr/0001-framework-choice.md); product direction in [`docs/adr/0002-social-vision-pivot.md`](docs/adr/0002-social-vision-pivot.md).

- **Next.js 16 App Router** + strict **TypeScript**
- **Supabase**: Auth, Postgres and Row-Level Security, with **`@supabase/ssr`** cookie sessions refreshed in [`proxy.ts`](proxy.ts) (the Next.js 16 successor to `middleware.ts`)
- **Tailwind CSS v4**, with design tokens in the [`app/globals.css`](app/globals.css) `@theme` block
- **Vercel** for hosting (preview URLs per branch); **Sentry** for errors
- **Node 24** + **pnpm 11**

## First time

You need Node 24 (`nvm use` reads [`.nvmrc`](.nvmrc)), pnpm 11 (pinned in `package.json`; `corepack enable` picks it up), Docker, and the Supabase CLI.

```bash
nvm use
pnpm install
supabase start          # local Postgres, Auth, Storage and the Mailpit inbox
supabase status -o env  # values for .env.development.local
pnpm dev
```

Put the local values in `.env.development.local`. [`.env.local.example`](.env.local.example) maps the names:

| `supabase status -o env` | `.env.development.local` |
|---|---|
| `API_URL` | `NEXT_PUBLIC_SUPABASE_URL` |
| `PUBLISHABLE_KEY` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| `SECRET_KEY` | `SUPABASE_SECRET_KEY` |

The app runs at [http://localhost:3000](http://localhost:3000).

- **Sign in** with any `@example.com` address. [`supabase/seed.sql`](supabase/seed.sql) allow-lists that domain, and the 6-digit code arrives in Mailpit at [http://127.0.0.1:54324](http://127.0.0.1:54324).
- **Seed data:**
  - `alice@example.com` and `bob@example.com` already have profiles.
  - `carol@example.com` goes through onboarding.
  - There are two demo trips.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Next.js dev server (Turbopack). |
| `pnpm build` / `pnpm start` | Production build, and serving it locally. |
| `pnpm lint` | ESLint (`eslint-config-next`). |
| `pnpm typecheck` | `tsc --noEmit`. |
| `pnpm test` | Vitest unit tests (`lib/**/*.test.ts`). |
| `pnpm test:db` | pgTAP suite in [`supabase/tests/database/`](supabase/tests/database/) against the local stack. Needs Docker. |
| `pnpm test:e2e` | Playwright mobile smoke test. Needs `supabase start`; reads sign-in codes from Mailpit. |
| `pnpm check:secrets` | Fails if a `"use client"` module can reach a server secret or the admin client. |

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs the checks and all three test suites on every pull request.

## Environments

| | Supabase | App |
|---|---|---|
| Local | `supabase start` (Docker) | `pnpm dev` |
| UAT | Hosted project `jettison`: test data only, invite-only | Vercel, `noindex` |
| Production | A new project at launch | Vercel |

Migrations reach UAT through CI on `main`. UAT testers are added to `private.onboarding_allowlist` with SQL; the test plan is in [`docs/uat/uat-1-test-plan.md`](docs/uat/uat-1-test-plan.md).

## Where to look first

- **Workflow:** [`AGENTS.md`](AGENTS.md) is the single entry point.
- **Always-on rules:** [`.cursor/rules/`](.cursor/rules/).
- **Domain language + MVP scope:** [`app-context/product-engineering.md`](app-context/product-engineering.md).
- **Architecture decisions:** [`docs/adr/`](docs/adr/). ADRs are sequential and dated.
- **Active session plan:** [`tasks/todo.md`](tasks/todo.md). Durable issues live in **Beads** (`bd`), not in markdown.

## Server vs client boundary (read this once)

App Router defaults to **Server Components**. `"use client"` is opt-in, and only when interactivity demands it. `SUPABASE_SECRET_KEY` and other server secrets **must not** be reachable from the client bundle. See [`.cursor/rules/typescript-react.mdc`](.cursor/rules/typescript-react.mdc) for the full rule; `pnpm check:secrets` enforces it in CI.
