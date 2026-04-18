# 0001. Web framework: Next.js App Router + TypeScript + Tailwind v4 + `@supabase/ssr` + Vercel

- Date: 2026-04-18
- Status: Accepted

## Context

**Jettison** is a mobile-first web app for organizing group trips, splitting shared costs, and moving money to organizers or directly to venues. The constraints framing this decision:

- **Backend is locked:** Supabase — Auth, Postgres, Row-Level Security (RLS). See [`AGENTS.md`](../../AGENTS.md) → "Stack".
- **Delivery target:** mobile-first web app; phone viewports first; tablet/desktop are progressive enhancement.
- **Trust boundary:** the app handles money between friends. The architecture skill ([`.cursor/skills/project-architecture/SKILL.md`](../../.cursor/skills/project-architecture/SKILL.md)) establishes a hard rule: `SUPABASE_SERVICE_ROLE_KEY` and any third-party-proving operation (signed webhooks, payment provider calls) must run **server-side**. The framework choice has to honor that boundary as a first-class concern, not an afterthought.
- **MVP scope:** create trip → add people → add costs → split → settle. Out of scope: BNPL, public/social feed, native mobile clients (Expo/React Native).
- **Brand:** **Jettison** (full word, name-of-record). The `JTSN` monogram is a secondary mark for tight surfaces only. The visual direction is locked at the direction level in [`app-context/product-engineering.md`](../../app-context/product-engineering.md) → "Design direction" — typography (Fraunces + Inter + JetBrains Mono), warm palette with a single Ember accent, oversized money numerals as the signature motif.
- **AGENTS.md baseline** explicitly recommends **Next.js App Router + TypeScript + Tailwind CSS + `@supabase/ssr` + Vercel** as the primary path, with **Vite + React Router + Supabase** (SPA, no SSR) listed as the alternate. This ADR turns the recommendation into a decision.

## Decision

We are building Jettison as a **Next.js 16+ App Router** application, written in **strict TypeScript**, styled with **Tailwind CSS v4** (tokens in the `@theme` block in `app/globals.css`), authenticated and database-clienteed via **`@supabase/ssr` + `@supabase/supabase-js`**, and deployed on **Vercel**. **pnpm** is the package manager.

This decision also collapses the styling-stack open question — Tailwind v4 is the styling solution, and tokens live in the `@theme` block in `app/globals.css`. That closes [`tripplanner-rud`](#) in the same chunk as this ADR.

## Alternatives considered

### Option A — Next.js App Router + Supabase SSR + Tailwind v4 + Vercel _(chosen)_

**Pros:**

- **Honors the trust boundary by default.** Server Components and Route Handlers are the default execution model; client interactivity is opt-in via `"use client"`. `SUPABASE_SERVICE_ROLE_KEY` lives in server-only modules and is statically prevented from leaking into the client bundle (a `"use client"` module that imports it fails to build, and a lint rule in [`.cursor/rules/typescript-react.mdc`](../../.cursor/rules/typescript-react.mdc) catches it earlier).
- **`@supabase/ssr` is a first-party Supabase library** for cookie-based session handling on the server. It is the supported path for SSR auth on Next.js App Router and aligns directly with the architecture skill's "anything that proves something to a third party lives server-side" rule.
- **Vercel is the canonical Next.js host.** Preview URLs per branch, edge cache + Fluid Compute defaults, OIDC-style env management — all production-grade out of the box, no infra plumbing for MVP.
- **Server Actions** give us a clean primitive for mutations without writing a separate REST/RPC layer; future webhook receivers (payment provider, email events) drop in as Route Handlers.
- **Performance posture for mobile** is good without effort: server-rendered HTML on first paint, client JS only where interactivity is opted into.
- **Tailwind v4** consolidates "design tokens" with "styling system" — the `@theme` block in `app/globals.css` is the single source of truth for the warm palette, type ramp, and spacing scale, generated as CSS custom properties. This makes the `tripplanner-rud` decision a no-op once Next is chosen.

**Cons:**

- **Larger surface area than an SPA.** App Router has more concepts to learn (Server vs Client Components, Server Actions, Route Handlers, middleware, layouts, streaming, Cache Components). Mitigation: [`.cursor/rules/typescript-react.mdc`](../../.cursor/rules/typescript-react.mdc) codifies the conventions so we are not re-deciding boundaries on every PR.
- **Vercel lock-in (mild).** App Router runs anywhere Node runs, but the operational ergonomics (preview URLs, OIDC, image/font defaults, Cache Components) are tightly tuned for Vercel. Reversing this means losing some of those for free. Acceptable: we explicitly want those defaults at MVP.
- **Less obvious "how to ship a static page"** vs Vite. Mitigation: Server Components default to fully static; we don't need to fight the framework.

### Option B — Vite + React Router + `@supabase/supabase-js` (SPA)

**Pros:**

- **Smallest mental model.** One bundle, one client, one router, no server. New contributors are productive in an afternoon.
- **Faster local dev iteration** for pure-client work (Vite's HMR is famously snappy; Turbopack closes the gap but Vite still wins for tiny apps).
- **No host lock-in.** The SPA bundle is a static asset; deploys anywhere (Vercel, Netlify, Cloudflare Pages, S3 + CloudFront). Useful if we ever wanted to self-host.

**Cons (decisive):**

- **No native server execution model.** The trust boundary still has to exist — payment-provider calls, webhook receivers, anything touching `SUPABASE_SERVICE_ROLE_KEY` — but a pure SPA cannot host those. We would need a separate BFF (Hono / tRPC / Express on Vercel Functions or Cloudflare Workers) before MVP could ship the payments slice. That is an extra system, an extra deploy, and an extra place to leak the boundary.
- **Auth ergonomics are worse.** SPAs handle Supabase Auth client-side with `localStorage` sessions; cookie-based SSR auth (which is what we want for fast first-paint and proper session refresh) requires building it from scratch with the BFF. `@supabase/ssr` exists specifically because client-only auth on a multi-page-feeling app is painful.
- **First paint is JS-blocked.** The bundle has to download, parse, and execute before the user sees their balance. On a 3G phone in transit (a real Jettison user in the "settle the trip" moment), that's a UX regression vs server-rendered HTML.
- **Cache Components / streaming / partial prerendering** — Next 16 features that benefit money-summary screens (cache the trip layout, stream the balance) — are unavailable. We would re-implement worse versions ourselves.
- **No cleanly idempotent webhook story** without standing up a separate server. Architecture skill's "webhook idempotency at the boundary" rule becomes harder to enforce.

### Option C — Remix / React Router 7 framework mode

**Pros:**

- Loader/action model is conceptually simple; SSR by default.
- Cookie-based auth is well-supported.
- Vercel deployment works fine.

**Cons:**

- **Smaller Supabase first-party support.** `@supabase/ssr` documents Next.js App Router and SvelteKit explicitly; Remix patterns exist but are community-driven and require more glue.
- **Smaller production-app footprint at Vercel.** Less canonical path means more debugging-by-googling-other-people's-blogs when things go sideways.
- **No clear mobile-web advantage** over Next App Router for our use case. Picks a smaller ecosystem for no measurable win.

### Option D — Expo / React Native (web target)

**Pros:** could ship native iOS/Android later from the same codebase.

**Cons:** **explicitly out of MVP scope** ([`AGENTS.md`](../../AGENTS.md) → "Out of scope (MVP)"). React Native Web for the web target is a worse mobile-web experience than a real mobile-web app. Defer until after MVP if at all.

## Consequences

### Easier

- **Server-vs-client boundary is enforceable by file convention** — Server Components by default, `"use client"` opt-in. The `rg "SUPABASE_SERVICE_ROLE_KEY" app/ components/ lib/` boundary check in our CI / verification step becomes a one-liner.
- **Payments + webhooks slot in cleanly** — Route Handlers for the webhook receiver (with idempotency table), Server Actions for in-flow charges. Architecture skill's evolution path (MVP → Payments v1 → Payouts v2) does not require a re-architecture.
- **Tokens have a single home** — `app/globals.css` `@theme` block. No separate token file, no two-source-of-truth drift between Tailwind config and CSS variables.
- **Type generation works out of the box** — `supabase gen types typescript` writes a single `.ts` file imported by Server Components and Route Handlers; same types end-to-end.
- **Vercel preview URLs per branch** are a real review accelerator for UI work — every Bead with a UI change gets a shareable URL.

### Harder

- **More framework concepts to keep straight.** A new contributor has to learn Server Components vs Client Components, Server Actions vs Route Handlers, `proxy.ts` semantics (Next.js 16 — formerly `middleware.ts`), and Tailwind v4's `@theme` block. Mitigation: [`.cursor/rules/typescript-react.mdc`](../../.cursor/rules/typescript-react.mdc) codifies the conventions; the [`.cursor/skills/project-architecture/SKILL.md`](../../.cursor/skills/project-architecture/SKILL.md) skill backs it up.
- **Vercel-flavored ergonomics** become the working assumption (OIDC tokens, preview URL semantics, Vercel's image/font defaults). Reversing this would mean losing some convenience-for-free.
- **`@supabase/ssr` cookie handling is fiddly** in middleware — we have to follow the official pattern exactly (re-set every cookie the auth client sets) or sessions silently stop refreshing. We adopt the documented pattern as-is in `lib/supabase/{server,client,middleware}.ts` and do not improvise.

### New rules / skills / migrations this implies

- **New rule:** [`.cursor/rules/typescript-react.mdc`](../../.cursor/rules/typescript-react.mdc) — App Router conventions; hard rule against `SUPABASE_SERVICE_ROLE_KEY` in any module that imports a `"use client"` module or sits under a client-bundled path.
- **Glob tightening:** [`.cursor/rules/mobile-web-ui.mdc`](../../.cursor/rules/mobile-web-ui.mdc) and [`.cursor/rules/project-creative-design.mdc`](../../.cursor/rules/project-creative-design.mdc) — replace the provisional `**/*.tsx` glob with `app/**/*.{ts,tsx}` + `components/**/*.{ts,tsx}`.
- **Doc updates:** [`AGENTS.md`](../../AGENTS.md) Stack section, [`app-context/product-engineering.md`](../../app-context/product-engineering.md) Design-tokens + Open-questions, [`.cursor/skills/project-ui-ux/SKILL.md`](../../.cursor/skills/project-ui-ux/SKILL.md) Tokens section — drop the "TBD" / "conditional" hedges, name the chosen path, cite this ADR.
- **No migrations** in this ADR. The first migration is a follow-up Bead (RLS template + a placeholder table).

## Follow-ups

Beads filed with `--discovered-from tripplanner-688`:

- **Supabase project provisioning + env wiring** — create the Supabase project, set anon + service-role keys in `.env.local` and Vercel project envs, run `supabase gen types typescript`. P1; gates real DB work and the auth roundtrip verification.
- **Vercel project linking + first deploy** — `vercel link`, configure envs in Vercel dashboard, ship the hello-world to a preview URL. P2.
- **First migration + RLS template** — set up `supabase/migrations/`, write a trivial table or just commit the migrations folder + `config.toml` so future migrations have a place to land. P2.
- **(Optional)** `bd ready` `blocked-by` cache bug — meta-Bead about the open `tripplanner-i6r` showing in `bd ready` despite its blocker. P3.

Closed in the same chunk as this ADR:

- [`tripplanner-688`](#) — _infra: choose web framework + scaffold (first ADR)._
- [`tripplanner-rud`](#) — _infra: choose styling solution + token location._ Tailwind v4 + `app/globals.css` `@theme` makes the styling and token-location decisions one and the same.

Rules / skills updated by this ADR:

- [`AGENTS.md`](../../AGENTS.md) — Stack section locked.
- [`app-context/product-engineering.md`](../../app-context/product-engineering.md) — Design tokens un-conditional; Open questions drops framework + styling.
- [`.cursor/skills/project-ui-ux/SKILL.md`](../../.cursor/skills/project-ui-ux/SKILL.md) — Tokens section locked.
- [`.cursor/rules/mobile-web-ui.mdc`](../../.cursor/rules/mobile-web-ui.mdc) — glob tightened.
- [`.cursor/rules/project-creative-design.mdc`](../../.cursor/rules/project-creative-design.mdc) — glob tightened; Tokens conditional replaced with definite pin.
- [`.cursor/rules/typescript-react.mdc`](../../.cursor/rules/typescript-react.mdc) — new file.
