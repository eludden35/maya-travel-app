# Lessons

Append-only log of patterns we got wrong (or nearly got wrong) and the fix. Every **user correction** should produce an entry here. Recurring patterns should be promoted into a `.cursor/rules/*.mdc` rule or a `.cursor/skills/*/SKILL.md` skill so the same mistake gets harder to repeat.

## How to append

Add a new section at the **bottom** using this template — never edit or delete prior entries:

```markdown
## YYYY-MM-DD — <short pattern title>

- **Context:** what task / file / area triggered the correction.
- **Mistake:** what we did or proposed.
- **Correction:** what the user (or evidence) said to do instead.
- **Generalization:** the rule of thumb to remember.
- **Followed up by:** rule/skill edited (path), Bead ID, or "noted only".
```

Skim this file at session start when the upcoming task touches an area you have lessons about.

---

<!-- Append entries below this line -->

## 2026-04-17 — Next.js 16 deprecates `middleware.ts` in favor of `proxy.ts`

- **Context:** Wiring `@supabase/ssr` session refresh during `tripplanner-688` (scaffold). Followed the official `@supabase/ssr` quickstart and dropped a `middleware.ts` at the repo root that called `updateSession`.
- **Mistake:** On Next.js **16+**, having both `middleware.ts` and `proxy.ts` (or even just `middleware.ts` if `proxy.ts` is the new convention) crashes the dev server with `Error: Both middleware file "./middleware.ts" and proxy file "./proxy.ts" are detected. Please use "./proxy.ts" only.` The page rendered as a 404 with `unhandledRejection` errors in the dev log.
- **Correction:** Next.js 16 renamed the root request-interceptor file from `middleware.ts` to `proxy.ts`, with the exported function renamed from `middleware` to `proxy`. The `config.matcher` shape is unchanged. Killed the dev server, removed `.next/`, renamed the file, renamed the export, and updated **all** documentation references that still said `middleware.ts` (README, AGENTS, product-engineering, the new `typescript-react.mdc` rule, ADR 0001, and the helper at `lib/supabase/middleware.ts` whose comment still pointed agents at the old filename).
- **Generalization:** When following any third-party "Next.js" quickstart on Next.js 16+, search for `middleware.ts` and assume it should be `proxy.ts` (function `proxy`) at the root. Update internal docs in the same change so the next agent doesn't re-introduce the old name from copy-paste.
- **Followed up by:** Encoded directly in [`docs/adr/0001-framework-choice.md`](../docs/adr/0001-framework-choice.md), [`AGENTS.md`](../AGENTS.md), [`app-context/product-engineering.md`](../app-context/product-engineering.md), [`.cursor/rules/typescript-react.mdc`](../.cursor/rules/typescript-react.mdc), and [`README.md`](../README.md). No new rule needed — the convention is now baked into the docs the next agent will read first.

## 2026-04-17 — `create-next-app` resists scaffolding into a non-empty directory

- **Context:** Scaffolding the Next.js app for `tripplanner-688` over the existing `.cursor/`, `app-context/`, `tasks/`, `.beads/`, `AGENTS.md` meta-layer.
- **Mistake:** Running `pnpm create next-app .` in the workspace root would either refuse outright or risk clobbering tracked files.
- **Correction:** Scaffolded into `/tmp/jettison-scaffold` first, then `rsync -a --exclude='.git' --exclude='node_modules' ./ /Users/section31-61/projects/maya-travel-app/` to selectively merge the new files into the workspace. Preserved `.git/`, `.beads/`, and every meta-folder cleanly.
- **Generalization:** When introducing a scaffolder into a repo that already has a context layer (rules, skills, ADRs, issue store), default to **scaffold-to-temp + rsync-merge**, never **scaffold-in-place**. Exclude `.git`, `node_modules`, and any other folders that should not be touched.
- **Followed up by:** Noted only. If we ever scaffold a second framework (unlikely), revisit.

## 2026-04-17 — Supabase: `sb_secret_*` value behind a `NEXT_PUBLIC_*` env name = leaked credential

- **Context:** Wiring real Supabase credentials into `.env.local` for the first time (follow-up to `tripplanner-3ca`). The Supabase wizard hands out two new-style keys: `sb_publishable_*` (public, safe in browser) and `sb_secret_*` (server-only, RLS-bypass). The user pasted both, but accidentally put the **secret** key under the env var name `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Mistake:** A `sb_secret_*` value behind any `NEXT_PUBLIC_*` env name is **inlined into the browser bundle by Next.js** — every visitor gets a full-database credential that bypasses RLS. The dev server had already loaded the file by the time we caught it, so the secret was on disk, in process memory, possibly in a `.next/` dev bundle, and pasted into chat twice.
- **Correction:** Stopped before any further verification. Required the user to **rotate the secret in the Supabase dashboard FIRST** (treat it as compromised), then fixed the file shape. The corrected env contract is `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (public, browser-safe) and `SUPABASE_SECRET_KEY` (server-only, **no** `NEXT_PUBLIC_` prefix). Migrated `lib/supabase/{server,client,middleware}.ts` from `NEXT_PUBLIC_SUPABASE_ANON_KEY` → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Tightened the boundary `rg` check to also catch literal `sb_secret_` strings: `rg -n 'SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|sb_secret_' app/ components/ lib/ proxy.ts`. Nuked `.next/` to drop any cached bundle that might have included the bad value.
- **Generalization:** Two paired rules to internalize: (1) **No secret-shaped value (`sb_secret_*`, `service_role` JWT, payment provider secret, webhook signing key, etc.) ever appears behind a `NEXT_PUBLIC_*` env name.** Period. (2) **`NEXT_PUBLIC_*` is a one-way door.** Treat anything under that prefix as if it were already on a public CDN — because, in production, it is. When a leak happens, **rotate first, rename the env var second.**
- **Followed up by:** [`.cursor/rules/supabase-security.mdc`](../.cursor/rules/supabase-security.mdc) (rewritten "API keys" section with both naming systems + the inline-into-bundle warning), [`.cursor/rules/typescript-react.mdc`](../.cursor/rules/typescript-react.mdc) (boundary `rg` extended to cover `SUPABASE_SECRET_KEY` and `sb_secret_` literals), [`.cursor/skills/project-supabase/SKILL.md`](../.cursor/skills/project-supabase/SKILL.md) (env-vars table), [`.cursor/skills/project-architecture/SKILL.md`](../.cursor/skills/project-architecture/SKILL.md), [`app-context/product-engineering.md`](../app-context/product-engineering.md), [`.env.local.example`](../.env.local.example), and the three `lib/supabase/*.ts` helpers.

## 2026-04-18 — Vision pivots are an explicit chunk — overhaul docs/rules/skills/Beads in one go before any feature code

- **Context:** Mid-session, the founder's product framing changed from "Jettison is a transactional group-payments app, social explicitly OUT of MVP" to "Jettison is a social network for group travel, with payments built in." This is not a feature; it's a shift in **what the product is**. The first instinct (mine) was to immediately scope the first social Bead. The user (correctly) wanted the vision pivot to land coherently across the whole context layer first.
- **Mistake:** Treating a vision pivot like a normal feature chunk — file one Bead, write code, sort the docs out later. That path leaves stale "social is OUT of MVP" sentences in `AGENTS.md`, `product-engineering.md`, the domain skill, the PM skill, and the architecture skill, plus a Beads backlog that still reflects the old vision. The next agent (or me, next session) then reads a contradictory story: the new code says one thing, the rules and skills say another. The contradiction silently blocks correct decision-making for weeks.
- **Correction:** Treat a vision pivot as **its own chunk**, with **no feature code**, that touches every doc / rule / skill / ADR / Beads issue affected by the new framing in one coherent pass. The chunk's deliverables are: an ADR that records the decision and the alternatives; a rewritten one-liner in `AGENTS.md`; expanded MVP scope + glossary in `product-engineering.md`; updated user stories + IN/OUT examples + open-decisions list across the skills; updated hard rules across the security and review-checklist rules; a new Beads epic + sub-tasks + dep graph reflecting the new MVP, plus a Phase 2 epic with explicit gate criteria for anything deferred. Then — and only then — feature work begins. The proof checks include `rg` sweeps for stale phrasings (e.g. `rg "social feed.*out of (MVP|scope)"`) so leftover sentences don't survive.
- **Generalization:** **Vision-level changes get a dedicated docs+rules+skills+Beads chunk before any code.** The signals that a change is vision-level (vs feature-level): the one-liner in `AGENTS.md` no longer fits; the MVP loop description no longer fits; new entities appear in the domain glossary; new hard rules appear in the security layer; the OUT list shrinks materially. Any one of these triggers a new ADR + a "vision pivot" chunk. The chunk's hard rule for itself: **no feature code lands in the same commit as the pivot.** Doc + Beads commit ships first, feature work follows in subsequent chunks against the new Beads.
- **Followed up by:** [`docs/adr/0002-social-vision-pivot.md`](../docs/adr/0002-social-vision-pivot.md), [`AGENTS.md`](../AGENTS.md), [`app-context/product-engineering.md`](../app-context/product-engineering.md), [`app-context/initial-app-idea.md`](../app-context/initial-app-idea.md) (historical note added at top), the four lens skills (`project-architecture`, `project-pm`, `project-ui-ux`, `project-domain`), four rules (`supabase-security.mdc`, `project-review-checklist-sql.mdc`, `project-creative-design.mdc`, `project-core.mdc`), Beads epic `tripplanner-s3a` + 20 sub-tasks, AI follow-up `tripplanner-45u`, Phase 2 epic `tripplanner-9sp` + 6 sub-tasks, and notes appended to existing `tripplanner-bah` and `tripplanner-581`.
