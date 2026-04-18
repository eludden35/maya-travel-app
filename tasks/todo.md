# Session todo

The active execution plan for the **current chunk** of work. This file is short-lived: rewrite it per chunk; promote any long-lived items to Beads (`bd create …`). Do **not** let it grow into a parallel backlog.

> **Bead:** [`tripplanner-tw8`](#) — _design: visual identity exploration for Jettison (P3, decision)._ **CLOSED 2026-04-18.**
>
> **Goal:** Land a **direction-level** visual identity for Jettison — JTSN role, pillars, mood, motif, color direction, type pairing, reduced-motion behavior, and a conditional token location — and propagate it through the 4 source-of-truth files so future UI work stops re-deciding the brand on every screen.
>
> **Definition of done:** The 8 acceptance criteria in the bead, mapped concretely:
>
> 1. JTSN role chosen and recorded in [`AGENTS.md`](../AGENTS.md) + [`app-context/product-engineering.md`](../app-context/product-engineering.md).
> 2. Pillars finalized in `product-engineering.md` "Design direction" + the [`project-ui-ux`](../.cursor/skills/project-ui-ux/SKILL.md) skill (no more "working defaults until brand decisions land").
> 3. Color direction recorded with **sample** hex (primary + accent + warm neutral ramp + semantic) and contrast intent. Final WCAG AA verification deferred to a follow-up Bead at scaffold time.
> 4. Type pairing (display + text), modular scale, and body line-height recorded.
> 5. Mood keywords (3–5) recorded.
> 6. ≥1 layout motif recorded (signature motif called out).
> 7. Token location pinned **conditionally** ("Tailwind v4 `@theme` if Tailwind lands, otherwise `:root` CSS variables under `app/styles/tokens.css`"); final pin handled by the styling Bead.
> 8. Reduced-motion behavior documented (essential vs decorative motion + `prefers-reduced-motion` snippet).
>
> Plus: rewrite this file, file follow-up Beads, close `tripplanner-tw8` with a structured reason.

---

## Plan

- [x] **Step 1 — Reset `tasks/todo.md`** for this chunk (this file).
- [x] **Step 2 — Decide JTSN role.** **Secondary mark** (favicon / app shortcut / monogram / social avatar). Full word "Jettison" remains the primary wordmark; promotion path stays open.
- [x] **Step 3 — Lock pillars + mood + motif.** Pillars: **trust / warmth / momentum**. Mood: **generous, tactile, considered, quietly confident**. Signature motif: **oversized money numerals**; secondary motifs: anchored bottom action bar, layered warm surfaces.
- [x] **Step 4 — Color direction.** Warm neutrals + single accent (Ember `#D9531E`) + earthed semantics. Full sample ramp in `product-engineering.md`. Marked direction-level, not final.
- [x] **Step 5 — Type pairing.** **Fraunces** (display) + **Inter** (text) + **JetBrains Mono** (money tables only) — all Google Fonts SIL OFL. 1.250 modular scale, body 16/24 (line-height 1.5).
- [x] **Step 6 — Motion + tokens.** Reduced-motion spec written (essential vs decorative + 80 ms cap on essential under reduced-motion). Token location conditionally pinned to Tailwind v4 `@theme` or `:root` CSS variables, final pin tied to `tripplanner-rud`.
- [x] **Step 7 — Apply edits** to the 4 files: [`AGENTS.md`](../AGENTS.md), [`app-context/product-engineering.md`](../app-context/product-engineering.md), [`.cursor/rules/project-creative-design.mdc`](../.cursor/rules/project-creative-design.mdc), [`.cursor/skills/project-ui-ux/SKILL.md`](../.cursor/skills/project-ui-ux/SKILL.md).
- [x] **Step 8 — Verify.** `rg` sweep clean of stale hedges; lints clean; read-back coherent across all 4 files.
- [x] **Step 9 — File follow-up Beads.** [`tripplanner-i6r`](#) (spec-level lock, blocked-by `tripplanner-rud`) and [`tripplanner-uuf`](#) (visual mark) — both with `discovered-from: tripplanner-tw8`.
- [x] **Step 10 — Close bead.** `tripplanner-tw8` closed with structured reason covering all 8 criteria.
- [x] **Step 11 — Review section** below.

---

## Progress

- 2026-04-18: Plan approved (direction-level, single proposal). Todo rewritten for this chunk.
- 2026-04-18: JTSN role argued and decided — secondary mark. Trade-offs (primary wordmark vs dropped) documented in chat. Lower-regret choice for a payments product where trust trumps swagger.
- 2026-04-18: Pillars locked (no change), mood + motifs picked, color + type proposals made with explicit "direction-level / not final" caveats.
- 2026-04-18: Reduced-motion + conditional token location written. Conditional phrasing chosen over false precision because the styling stack (`tripplanner-rud`) is still open.
- 2026-04-18: 4 files edited. `rg` sweep returned only intentional references in bead text and closed-reason history; lints clean.
- 2026-04-18: Two follow-ups filed (`tripplanner-i6r` + `tripplanner-uuf`); `tripplanner-tw8` closed with full structured reason. Dolt auto-push warned (remote not initialized — pre-existing condition matching `origin/main [gone]` from initial git status), local close confirmed.

---

## Results / review

- **What shipped (2026-04-18):**
  - **Direction-level visual identity** for Jettison locked in [`app-context/product-engineering.md`](../app-context/product-engineering.md) → "Design direction" (8 new subsections: Pillars / Mood / Layout motifs / Color / Type / Motion / Anti-patterns / Design tokens).
  - **JTSN role decided:** secondary mark (favicon / app shortcut / monogram / social avatar). Primary wordmark = full word **Jettison**.
  - **Pillars** (trust / warmth / momentum), **mood** (generous, tactile, considered, quietly confident), and **3 motifs** (oversized money numerals as signature, anchored bottom action bar, layered warm surfaces) recorded.
  - **Color direction** with sample hex ramp (Ink / Ember / Paper / Card / Hairline / Muted / Secondary / Body + earthed semantics) — flagged as direction-level samples, NOT final brand values.
  - **Type pairing** (Fraunces + Inter + JetBrains Mono, all Google Fonts SIL OFL) with 1.250 modular scale and 1.5 body line-height.
  - **Motion spec** (150–200 ms ease-out default; 250 ms bottom-sheet) + **reduced-motion spec** (decorative motion cut, essential capped to 80 ms, snippet committed in two places).
  - **Token location pinned conditionally** — Tailwind v4 `@theme` block in `app/globals.css` if Tailwind chosen, otherwise `:root` CSS variables in `app/styles/tokens.css`. Final pin handled by [`tripplanner-rud`](#).
  - All four files updated: [`AGENTS.md`](../AGENTS.md), [`app-context/product-engineering.md`](../app-context/product-engineering.md), [`.cursor/rules/project-creative-design.mdc`](../.cursor/rules/project-creative-design.mdc), [`.cursor/skills/project-ui-ux/SKILL.md`](../.cursor/skills/project-ui-ux/SKILL.md). Stale "not yet decided" / "working defaults until brand" / "still being decided" prose removed.
  - Two follow-ups filed; [`tripplanner-tw8`](#) closed with structured reason text.

- **Evidence:**
  - Files changed: [`AGENTS.md`](../AGENTS.md), [`app-context/product-engineering.md`](../app-context/product-engineering.md), [`.cursor/rules/project-creative-design.mdc`](../.cursor/rules/project-creative-design.mdc), [`.cursor/skills/project-ui-ux/SKILL.md`](../.cursor/skills/project-ui-ux/SKILL.md), [`tasks/todo.md`](todo.md).
  - Verification: `rg "not yet decided|working defaults until brand|still being decided|visual identity is|visual identity exploration"` returns only the bead description, the closed-bead reason, and the active "visual identity **is locked**" sentence — no stale hedges in active prose.
  - Lints: clean across all edited markdown.
  - `bd show tripplanner-tw8` returns `status: closed`, `closed_at: 2026-04-18T13:56:33Z`, structured close reason 3899 chars covering all 8 acceptance criteria + both follow-up Bead IDs.
  - `bd show tripplanner-i6r` and `bd show tripplanner-uuf` confirm `discovered-from: tripplanner-tw8`; `tripplanner-i6r` additionally carries `blocked-by: tripplanner-rud` (styling).
  - **Not done by design:** no git commit (user did not request one; bead acceptance does not require a sha). Suggested next step is a single commit grouping these brand-identity changes when the user is ready. Dolt auto-push warned about a missing remote — a pre-existing condition (`origin/main [gone]` in the initial git status), unrelated to this chunk.

- **Lenses applied (per [`project-team-lenses.mdc`](../.cursor/rules/project-team-lenses.mdc)):**
  - **UI/UX (primary):** chose pillars/mood/motifs first, then derived palette and type from them; called out the signature motif (oversized money numerals) so future screens have a north star; built reduced-motion as a first-class concern with a non-motion-equivalent rule, not as a footnote; refused both "AI slop landing page" and "cool corporate-fintech grays" in the anti-patterns list because both fail the "warmth" pillar.
  - **PM:** held the line on direction-level scope per the user's call; did not collapse the styling decision into this bead even though it would have unblocked exact token-path pinning, because that's `tripplanner-rud`'s job; filed two crisp follow-ups with the right blocker (`tripplanner-i6r` blocked by styling) so the dependency graph stays honest; made the "out of scope" decisions explicit in the close reason.
  - **Architecture:** kept the token location **conditional** rather than picking one prematurely; trace was: chosen styling system → token file path → token-update mechanics. Doing it the other way would have forced rework when `tripplanner-rud` lands. Also flagged the cross-file consistency contract (4 files must agree on JTSN role + pillars + tokens) as a real constraint, not a doc-aesthetic concern.
  - **Code review:** verified four files end-to-end (no stale hedges, no contradictions, cross-links resolve), lints clean, dep graph confirmed for both follow-ups, close reason covers all 8 acceptance criteria explicitly.

- **Follow-ups (Bead IDs, not free-form TODOs):**
  - [`tripplanner-i6r`](#) — design: spec-level color + type lock for Jettison (final hex ramp with WCAG AA verified, font weights + license, tokens written into chosen styling system). **Blocked by** [`tripplanner-rud`](#) (styling stack). Discovered-from `tripplanner-tw8`.
  - [`tripplanner-uuf`](#) — design: visual mark for Jettison (wordmark, JTSN monogram, favicon, app shortcut). Not blocked. Discovered-from `tripplanner-tw8`.
  - **No user-action items pending** for this chunk — the brand-name follow-ups (domains, social handles, App Store search) belong to `tripplanner-a8c`'s pending list, not this one.

- **Lessons:** No user-correction surprises this chunk — the two scoping calls at the start (direction-level + single proposal) framed the work cleanly, and the per-step "propose then apply" cadence kept the file edits boring. Nothing new to append to [`lessons.md`](lessons.md).
