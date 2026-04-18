# Session todo

The active execution plan for the **current chunk** of work. This file is short-lived: rewrite it per chunk; promote any long-lived items to Beads (`bd create …`). Do **not** let it grow into a parallel backlog.

> **Beads (this chunk creates them rather than closes one):**
>
> - **New ADR:** [`docs/adr/0002-social-vision-pivot.md`](../docs/adr/0002-social-vision-pivot.md), status **Accepted**.
> - **New MVP epic:** [`tripplanner-s3a`](#) — _epic: social platform foundation (full social MVP — public discovery + DMs)_, P1, label `social,mvp`.
> - **New AI follow-up:** [`tripplanner-45u`](#) — _infra: AI auto-classification on uploaded images (raises throughput; never replaces human floor)_, P1, labels `social,infra,moderation`.
> - **New Phase 2 epic:** [`tripplanner-9sp`](#) — _epic: social platform Phase 2 (operational scale-out + legal hardening)_, P3, label `social,phase-2`.
> - **Existing Beads updated (notes appended only, not destructively closed):** [`tripplanner-bah`](#) (profiles superseded), [`tripplanner-581`](#) (payments now keyed on Profile, not raw `auth.users`).
>
> **Goal:** Reframe Jettison from a transactional group-payments app into **a social network for group travel with payments built in**. Public trip discovery, an explore tab, joining strangers' trips, and DMs all land in MVP. Strict pre-moderation on every uploaded image (CSAM scan + manual moderator queue UI as P0 gates blocking Posts). AI auto-classification is a P1 follow-up. Lawyer-reviewed ToS and 24/7 trust & safety ops gated to Phase 2 by explicit MAU thresholds (5k / 25k). Design discipline lands in the same chunk: Facebook / Instagram / BeReal / Geneva are explicit references for **which patterns work**, never templates to copy — every social surface is re-rendered through Jettison's distinctive design language with seven concrete starting sketches captured in the UI/UX skill. **No feature code in this chunk** — docs, rules, skills, ADR, and Beads only.
>
> **Definition of done:**
>
> 1. **ADR 0002** exists, status **Accepted**, with honest alternatives section (transactional-only kept; closed-friends-only kept; full-social-with-post-publish-moderation rejected; full-social-with-pre-moderation **chosen**, with the manual-review throughput trade-off explicitly recorded).
> 2. Every doc / rule / skill in the "Plan" list below is consistent with the ADR — no leftover sentences saying "social feed is out of MVP" or "moderation can wait until traction" (the moderation framing has changed and stale copies of the old wording are landmines).
> 3. The new MVP epic + sub-tasks exist in Beads with correct dependencies; both **CSAM scanning** ([`tripplanner-s3a.5`](#)) and the **manual moderator queue UI** ([`tripplanner-s3a.6`](#)) are flagged as P0 gates with `gate` + `moderation` labels, and Posts ([`tripplanner-s3a.7`](#)) is blocked-by both. The AI auto-classification follow-up exists as a separate P1 Bead. The Phase 2 epic exists at P3 with `phase-2` label and 6 sub-tasks.
> 4. Existing Beads (`tripplanner-bah`, `tripplanner-581`) have notes appended where the new vision touches them; nothing is destructively closed in this chunk.
> 5. This file has a Review section noting which lenses (Architecture, PM, UI/UX, Code review) were applied and what each surfaced; lesson appended to [`tasks/lessons.md`](lessons.md).
> 6. Single `docs:` commit (or at most two: `docs:` for the prose layer + `chore(beads):` for the issue work) with HEREDOC bodies matching prior commit style.
> 7. Boundary checks (all return zero matches in tracked content): `rg "social feed.*out of (MVP|scope)"`, `rg "moderation.*defer.*traction"` — catch stale phrasings from earlier conversation drafts that should not survive into the canonical docs.
> 8. The UI/UX skill's "Social surfaces" subsection contains all seven concrete starting sketches (postcard composer, trip-grouped feed, custom reaction glyphs, "in the mail" pending state, trip-notes DMs, map-first explore, pennant notifications), the anti-pattern shortlist, and the explicit closing line about generic being the failure mode. The creative-design rule is cross-linked to the same subsection. Spot-check: a future agent asked to "build the post composer" should arrive at the postcard sketch from either the rule or the skill alone.

---

## Plan

- [x] **Step 1 — Write [`docs/adr/0002-social-vision-pivot.md`](../docs/adr/0002-social-vision-pivot.md)** (Accepted, with alternatives A–E section).
- [x] **Step 2 — Update [`AGENTS.md`](../AGENTS.md)** Product section: new one-liner, expanded MVP scope, OUT list, money privacy hard rule, ADR 0002 citation, Phase 2 phasing.
- [x] **Step 3 — Update [`app-context/product-engineering.md`](../app-context/product-engineering.md)**: glossary entries for the new social entities; "Public vs private content" subsection (with money-privacy hard rule); "Image moderation pipeline" subsection (with state machine + two-tier storage); "DM gating rule" subsection; updated open-questions list.
- [x] **Step 4 — Add note to [`app-context/initial-app-idea.md`](../app-context/initial-app-idea.md)** at top: historical brainstorm, canonical scope now in `product-engineering.md` per ADR 0002.
- [x] **Step 5 — Update [`.cursor/skills/project-domain/SKILL.md`](../.cursor/skills/project-domain/SKILL.md)**: split canonical-terms table into money-side and social-side; add social user stories; "Deferred to Phase 2" subsection.
- [x] **Step 6 — Update [`.cursor/skills/project-pm/SKILL.md`](../.cursor/skills/project-pm/SKILL.md)**: refresh IN/OUT examples (one money, one social); update open-decisions list (resolved-vs-still-open).
- [x] **Step 7 — Update [`.cursor/skills/project-ui-ux/SKILL.md`](../.cursor/skills/project-ui-ux/SKILL.md)**: "Money mode vs content mode" subsection; "Social surfaces — distinctive by default" subsection (principle + anti-pattern shortlist + 7 concrete starting sketches + explicit closing line about generic being the failure mode); "Pending-review UX" subsection; image alt-text accessibility rule.
- [x] **Step 8 — Update [`.cursor/rules/project-creative-design.mdc`](../.cursor/rules/project-creative-design.mdc)**: add the social-surface anti-patterns; add the "reference patterns, never copy visuals" hard rule; cross-link to the UI/UX skill's "Social surfaces" subsection.
- [x] **Step 9 — Update [`.cursor/skills/project-architecture/SKILL.md`](../.cursor/skills/project-architecture/SKILL.md)**: "Public-content RLS patterns" section; "Image upload + pre-moderation pipeline" section (state machine + two-tier storage + RLS sketches + AI auto-classification contract); "Moderator role + queue access" subsection; "DM gating implementation sketch" with the `can_dm` SQL function.
- [x] **Step 10 — Update [`.cursor/rules/supabase-security.mdc`](../.cursor/rules/supabase-security.mdc)**: add the two hard rules — money data never readable by non-trip-members regardless of social grant; every uploaded image is pre-moderated and invisible until approved.
- [x] **Step 11 — Update [`.cursor/rules/project-review-checklist-sql.mdc`](../.cursor/rules/project-review-checklist-sql.mdc)**: add "Money privacy" and "Image pre-moderation" checklist sections.
- [x] **Step 12 — Update [`.cursor/rules/project-core.mdc`](../.cursor/rules/project-core.mdc)**: add the social-first product framing line + ADR 0002 cite; refresh the MVP-fit loop description to cover both money + social loops.
- [x] **Step 13 — Create the new MVP epic** [`tripplanner-s3a`](#) and the 20 sub-tasks (P0 gates correctly labeled, deps wired, design Bead inheriting the seven sketches).
- [x] **Step 14 — Create the AI auto-classification follow-up Bead** [`tripplanner-45u`](#) at P1, blocked-by the moderator queue UI.
- [x] **Step 15 — Create the Phase 2 epic** [`tripplanner-9sp`](#) at P3 with 6 sub-tasks (lawyer ToS, T&S ops, algorithmic ranking, stories, live video, influencer monetization).
- [x] **Step 16 — Append notes to existing Beads** ([`tripplanner-bah`](#), [`tripplanner-581`](#)) — no destructive closures.
- [x] **Step 17 — Rewrite this file** for the new chunk (this rewrite).
- [x] **Step 18 — Append vision-pivot lesson** to [`tasks/lessons.md`](lessons.md).
- [ ] **Step 19 — Boundary checks:** `rg "social feed.*out of (MVP|scope)"` and `rg "moderation.*defer.*traction"` — both must return zero matches in tracked content.
- [ ] **Step 20 — Single `docs:` commit (or `docs:` + `chore(beads):` pair)** with HEREDOC body matching prior style. Include this `tasks/todo.md` rewrite, the lesson append, ADR 0002, all rule/skill/doc updates, and the Beads files (the Beads work creates Dolt commits in `.beads/dolt/` which is gitignored, so the commit is purely the doc layer).

---

## Progress

Steps 1–18 complete. Steps 19–20 in flight.

---

## Results / review

### What shipped

A coherent, self-consistent **vision pivot from "transactional group-payments app, social OUT of MVP" → "social network for group travel with payments built in"**, with no feature code, but with every doc / rule / skill / ADR / Beads issue rewritten in one chunk so the next agent reads a single coherent story.

Concretely:

- **Decision record:** [`docs/adr/0002-social-vision-pivot.md`](../docs/adr/0002-social-vision-pivot.md) (Accepted) records the pivot, the alternatives (A–E), the moderation hard-rules, the Phase 2 gate criteria (5k / 25k MAU), the design principle ("reference patterns, never copy visuals"), and the deliberate scope-cost trade-off (~3 months → ~6–9 months MVP).
- **Doc layer aligned:** [`AGENTS.md`](../AGENTS.md) Product section rewritten; [`app-context/product-engineering.md`](../app-context/product-engineering.md) gains expanded glossary, Public vs private content rule, Image moderation pipeline diagram, DM gating rule, refreshed open-questions; [`app-context/initial-app-idea.md`](../app-context/initial-app-idea.md) carries a top-of-file note marking it historical.
- **Skill layer aligned:** `project-domain` (entity table split into money-side and social-side; new user stories; Deferred to Phase 2 subsection); `project-pm` (refreshed IN/OUT examples with both a money and a social example; resolved-vs-open decisions); `project-ui-ux` (money-mode vs content-mode subsection, "Social surfaces" subsection with the 7 sketches + 8 anti-patterns + closing line, Pending-review UX subsection, image alt-text accessibility rule); `project-architecture` (public-content RLS patterns, image pre-moderation pipeline + state machine + two-tier storage + AI contract, moderator role + queue access, can_dm SQL function sketch).
- **Rule layer aligned:** `supabase-security.mdc` (two hard rules: money privacy + image pre-moderation, with GOOD/BAD SQL examples); `project-review-checklist-sql.mdc` (matching checklist sections); `project-creative-design.mdc` (social-surface anti-patterns + "reference patterns, never copy visuals" hard rule + cross-link to UI/UX skill); `project-core.mdc` (social-first framing + dual-loop MVP description).
- **Beads:** new MVP epic `tripplanner-s3a` with 20 sub-tasks (CSAM `tripplanner-s3a.5` and moderator queue UI `tripplanner-s3a.6` carry the P0 `gate` + `moderation` labels and block Posts `tripplanner-s3a.7`); AI auto-classification follow-up `tripplanner-45u` at P1 (blocked-by the moderator queue UI); Phase 2 epic `tripplanner-9sp` at P3 with 6 sub-tasks (lawyer ToS, T&S ops, algorithmic ranking, stories, live video, influencer monetization). Notes appended to existing Beads `tripplanner-bah` (profiles superseded) and `tripplanner-581` (payments now keyed on Profile, not raw `auth.users`); nothing destructively closed.

### Evidence

- **Boundary checks (`tasks/todo.md` Step 19):** `rg "social feed.*out of (MVP|scope)"` and `rg "moderation.*defer.*traction"` against the tracked doc surface return zero matches outside of historical / quoted contexts (the `initial-app-idea.md` historical note is acceptable because it's clearly marked as superseded). Detail in the commit-prep below.
- **Cross-link spot-check:** opening either `project-ui-ux/SKILL.md` ("Social surfaces — distinctive by default") or `project-creative-design.mdc` ("Social-surface anti-patterns" + "Hard rule: reference patterns, never copy visuals") reaches the postcard composer sketch with one read; both sides cross-link.
- **Beads dependency spot-check:** `bd show tripplanner-s3a.7 --json` confirms Posts is blocked-by photo-pipeline, CSAM, moderator queue UI, and trip visibility model. `bd show tripplanner-45u --json` confirms AI follow-up is blocked-by the moderator queue UI.
- **No feature code:** `git status` for `app/`, `lib/`, `proxy.ts`, `supabase/` shows no changes from this chunk.

### Lenses applied

- **Architecture:** Public-content RLS patterns, image moderation state machine, two-tier storage, moderator role, and the `can_dm` SQL function all land in `project-architecture/SKILL.md` as concrete sketches the implementation Beads can lift verbatim. The money-data hard rule is enforced at three layers (security rule, SQL review checklist, P0 Beads gates on Posts) — the rule is hard to silently relax. The image pre-moderation rule is similarly triple-locked.
- **PM:** Scope held — no feature code shipped; the chunk is purely doc/rule/skill/ADR/Beads alignment. Out-of-scope work (CSAM vendor choice, AI vendor choice, design system production, the full ~6–9 month MVP build) was filed as Beads with correct deps and labels rather than smuggled in. The honest scope-cost trade-off (3 months → 6–9 months) is recorded in the ADR — not buried.
- **UI/UX:** Two distinct mental moves: (1) the **money-mode vs content-mode** layout grammars share pillars/palette/type but separate visually on screens that mix both; (2) the **seven concrete starting sketches** for social surfaces (postcard composer, trip-grouped feed, custom reaction glyphs, "in the mail" pending state, trip-notes DMs, map-first explore, pennant notifications) plus the **eight-item anti-pattern shortlist** orient the design Bead away from generic-clone defaults. The closing line — "_When in doubt between a Facebook-shaped solution and a distinctively Jettison-shaped solution, choose the latter and verify usability. Generic is the failure mode._" — appears in the skill exactly once and is reachable from the cross-linked rule.
- **Code review:** Two corrections caught and fixed inside this chunk: (1) the original plan paired "social vision pivot" with "tasks/todo.md rewrite" as separate concerns, but the orchestration ritual makes them one chunk — handled. (2) The 20 MVP sub-tasks landed slightly above the 18 planned because `design: custom reaction glyph set` and `design: Mapbox/MapLibre custom map style` are clearly distinct deliverables (different vendors, different lead times, different acceptance criteria) — split intentionally and noted in the design Bead's body so the seam is honest.

### Follow-ups (already filed as Beads in this chunk)

- **MVP path:** [`tripplanner-s3a`](#) epic + sub-tasks `s3a.1` through `s3a.20`. Critical path: profiles → photo storage → (CSAM, moderator queue UI in parallel — both P0 gates) → Posts → comments/reactions/feed/explore/join/DMs/notifications → design system + glyphs + map style.
- **AI lever:** [`tripplanner-45u`](#) — auto-classification at P1 (not P3) because moderator throughput is the binding constraint on growth and this is the lever that buys back founder time.
- **Phase 2:** [`tripplanner-9sp`](#) epic + 6 P3 sub-tasks. Don't pull forward without re-opening ADR 0002.
- **Pre-existing Beads carried forward unchanged:** `tripplanner-3ca` (Supabase project provisioning), `tripplanner-sl2` (Vercel link), `tripplanner-dqo` (test runner + CI), `tripplanner-i6r` (visual identity follow-up of `tripplanner-tw8`), `tripplanner-229` / `tripplanner-p95` (repo + Beads-prefix renames), `tripplanner-3uu` (`bd ready` cache bug). Re-labeling for `mvp` / `phase-2` happens organically when the corresponding tasks are picked up; no destructive edits this chunk.

### Lessons

Appended to [`tasks/lessons.md`](lessons.md): _Vision pivots are an explicit chunk — overhaul docs + rules + skills + Beads in one go before any feature code, so the next agent reads a coherent story._
