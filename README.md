# Jettison

> Jettison is the mobile-first way for groups to plan, split, and settle shared trips and events — so no one fronts the money or chases anyone afterward.

Mobile-first web app. Public product name **Jettison**; the repo folder name (`maya-travel-app`) and the Beads issue prefix (`tripplanner`) are **legacy/internal** and scheduled to be renamed.

## Stack

Locked in [`docs/adr/0001-framework-choice.md`](docs/adr/0001-framework-choice.md):

- **Next.js 16 App Router** + strict **TypeScript**
- **Tailwind CSS v4** — design tokens in [`app/globals.css`](app/globals.css) `@theme`
- **`@supabase/ssr`** + `@supabase/supabase-js` — cookie-based auth via [`proxy.ts`](proxy.ts) (the Next.js 16 successor to `middleware.ts`)
- **Vercel** for hosting (preview URLs per branch)
- **pnpm** for package management

## First time

```bash
pnpm install
cp .env.local.example .env.local   # then fill in real Supabase project values
pnpm dev
```

The dev server runs at [http://localhost:3000](http://localhost:3000). Without real Supabase credentials, the page renders but the auth flow won't complete — that's expected; provisioning is tracked in Beads.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Next.js dev server (Turbopack default in 16). |
| `pnpm build` | Production build. |
| `pnpm start` | Serve the production build locally. |
| `pnpm lint` | ESLint (`eslint-config-next`). |
| `pnpm typecheck` | `tsc --noEmit` — the gate for "is this branch typesound". |

## Where to look first

- **Workflow:** [`AGENTS.md`](AGENTS.md) is the single entry point.
- **Always-on rules:** [`.cursor/rules/`](.cursor/rules/).
- **Domain language + MVP scope:** [`app-context/product-engineering.md`](app-context/product-engineering.md).
- **Architecture decisions:** [`docs/adr/`](docs/adr/) — ADRs are sequential and dated.
- **Active session plan:** [`tasks/todo.md`](tasks/todo.md). Durable issues live in **Beads** (`bd`), not in markdown.

## Server vs client boundary (read this once)

App Router defaults to **Server Components**. `"use client"` is opt-in and only when interactivity demands it. `SUPABASE_SERVICE_ROLE_KEY` and other server secrets **must not** be reachable from the client bundle — see [`.cursor/rules/typescript-react.mdc`](.cursor/rules/typescript-react.mdc) for the full rule and the boundary `rg` check used in CI.
