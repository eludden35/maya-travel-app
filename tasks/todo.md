# Session todo

The active execution plan for the **current chunk** of work. This file is short-lived: rewrite it per chunk; promote any long-lived items to Beads (`bd create …`). Do **not** let it grow into a parallel backlog.

> **Beads:**
>
> - [`tripplanner-688`](#) — _infra: choose web framework + scaffold (first ADR), P1, decision._
> - [`tripplanner-rud`](#) — _infra: choose styling solution + token location, P2, decision._ Collapsed into this chunk because Tailwind v4 = the styling = the token home; splitting them across two chunks creates a contrived seam.
>
> **Goal:** Lock **Next.js + TypeScript + Tailwind v4 + `@supabase/ssr` + Vercel** as the stack via ADR 0001; scaffold the app in-place over the existing meta-folders (`.cursor/`, `app-context/`, `tasks/`, `.beads/`, `AGENTS.md`); wire `@supabase/ssr` with a tiny hello-world authenticated page that proves the server-vs-client boundary; initialize Tailwind v4 tokens from the direction-level palette; tighten the rule globs to real paths.
>
> **Definition of done:**
>
> 1. `docs/adr/0001-framework-choice.md` exists with status **Accepted**, follows the template in [`.cursor/skills/project-architecture/SKILL.md`](../.cursor/skills/project-architecture/SKILL.md), and has honest pros/cons against Vite SPA.
> 2. [`AGENTS.md`](../AGENTS.md) Stack section is locked (no TBDs) and cites ADR 0001; [`app-context/product-engineering.md`](../app-context/product-engineering.md) "Open product/eng questions" drops the framework + styling lines and "Design tokens" converts from conditional to definite (Tailwind v4 `@theme` in `app/globals.css`); [`.cursor/skills/project-ui-ux/SKILL.md`](../.cursor/skills/project-ui-ux/SKILL.md) Tokens section is updated to match.
> 3. Repo scaffolded — Next.js app initialized in-place; `pnpm dev` starts; the hello-world page renders; auth roundtrip works _if_ Supabase creds are present (otherwise documented as deferred to the provisioning Bead).
> 4. [`.cursor/rules/typescript-react.mdc`](../.cursor/rules/typescript-react.mdc) added (App Router conventions; hard rule against `SUPABASE_SERVICE_ROLE_KEY` in modules that touch the client bundle).
> 5. Glob frontmatter in [`.cursor/rules/mobile-web-ui.mdc`](../.cursor/rules/mobile-web-ui.mdc) and [`.cursor/rules/project-creative-design.mdc`](../.cursor/rules/project-creative-design.mdc) tightened from `**/*.tsx` to `app/**/*.{ts,tsx}` + `components/**/*.{ts,tsx}`. The `project-creative-design.mdc` Tokens conditional is replaced with a definite pin to `app/globals.css` `@theme`.
>
> Plus: rewrite this file (done by Step 1), file follow-up Beads, close [`tripplanner-688`](#) **and** [`tripplanner-rud`](#) with structured reasons, single `scaffold:` commit, and a Review section.

---

## Plan

- [ ] **Step 1 — Reset `tasks/todo.md`** for this chunk (this file).
- [ ] **Step 2 — Confirm pnpm vs npm + Supabase project status.** Default pnpm. Auth roundtrip verification is gated on real Supabase creds being present.
- [ ] **Step 3 — Write `docs/adr/0001-framework-choice.md`** using the architecture skill template, status `Accepted`, with honest pros/cons vs Vite SPA.
- [ ] **Step 4 — Run `create-next-app` in-place** with TS / Tailwind / App Router / ESLint / `@/*` alias / chosen package manager. Verify it coexists with `.cursor/`, `app-context/`, `tasks/`, `.beads/`, `AGENTS.md`. If it refuses non-empty dir, scaffold to temp and merge.
- [ ] **Step 5 — Install `@supabase/ssr` + `@supabase/supabase-js`.** Create `lib/supabase/{server,client,middleware}.ts` per the official `@supabase/ssr` pattern; add `middleware.ts` that refreshes the session on every request.
- [ ] **Step 6 — Initialize Tailwind v4 `@theme` block** in `app/globals.css` with the direction-level palette from `product-engineering.md` (Ink / Ember / Paper / Card / Hairline / Muted / Secondary / semantic). Wire Fraunces + Inter + JetBrains Mono via `next/font`. Drop in the `prefers-reduced-motion` block.
- [ ] **Step 7 — Build the auth-aware hello-world.** `app/page.tsx` (server component, "Sign in" or "Hello {email}") + `app/auth/sign-in/page.tsx` (`"use client"`, minimal form) + `app/auth/callback/route.ts` + `app/auth/sign-out/route.ts`. Include one oversized money numeral as a faux balance to validate the type pairing actually loads.
- [ ] **Step 8 — Add `.cursor/rules/typescript-react.mdc`.** Server Components default; `"use client"` only when interactivity demands it; Server Actions for mutations; Route Handlers when you need a public URL; hard rule against `SUPABASE_SERVICE_ROLE_KEY` in modules that touch the client bundle.
- [ ] **Step 9 — Update doc layer.** [`AGENTS.md`](../AGENTS.md) Stack section + [`app-context/product-engineering.md`](../app-context/product-engineering.md) Design-tokens + Open-questions + [`.cursor/skills/project-ui-ux/SKILL.md`](../.cursor/skills/project-ui-ux/SKILL.md) Tokens section.
- [ ] **Step 10 — Tighten globs.** [`.cursor/rules/mobile-web-ui.mdc`](../.cursor/rules/mobile-web-ui.mdc) and [`.cursor/rules/project-creative-design.mdc`](../.cursor/rules/project-creative-design.mdc) — replace `**/*.tsx` with `app/**/*.{ts,tsx}` + `components/**/*.{ts,tsx}`. `project-creative-design.mdc` Tokens conditional → definite pin to `app/globals.css` `@theme`.
- [ ] **Step 11 — Verify.** `pnpm install` clean; `pnpm dev` starts; `pnpm tsc --noEmit` clean; `pnpm lint` clean; `rg` boundary check (`SUPABASE_SERVICE_ROLE_KEY` only in non-`"use client"` files); `prefers-reduced-motion` present in `app/globals.css`. Auth roundtrip if Supabase creds exist; otherwise document deferred.
- [ ] **Step 12 — File follow-up Beads** with `--discovered-from tripplanner-688`: (a) Supabase project provisioning + env wiring, (b) Vercel project linking + first deploy, (c) first migration + RLS template, (optional) `bd ready` blocked-by cache bug meta-bead.
- [ ] **Step 13 — Close [`tripplanner-688`](#) AND [`tripplanner-rud`](#)** with structured reasons (acceptance criteria + commit sha + follow-up bead IDs).
- [ ] **Step 14 — Single `scaffold:` commit** grouping the scaffold work (ADR + Next/Tailwind/Supabase + rules + docs). HEREDOC body, matches prior commit style.
- [ ] **Step 15 — Review section** below: what shipped, evidence (commit sha, dev server output, boundary `rg` results), lenses applied, follow-ups, lessons (if any).

---

## Progress

_Filled as steps complete._

---

## Results / review

_Filled at Step 15._
