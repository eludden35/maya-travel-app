---
name: template ToS / Community Guidelines / privacy policy + footer (s3a.17)
overview: "Stand up the three template legal documents at /legal/{terms,community-guidelines,privacy} plus a single shared footer linking to all three. Pure content + chrome chunk — no DB, no migrations. The sign-up acceptance gate (acceptance row + checkbox) is deferred to a follow-up Bead."
todos:
  - id: pages
    content: "Create app/legal/terms/page.tsx, app/legal/community-guidelines/page.tsx, app/legal/privacy/page.tsx — server components, static prose, last-updated date, mobile-first reading width, distinctive (warm + Fraunces) typography per project-creative-design / project-ui-ux skills. Each page carries a top banner: 'Template documents — not yet reviewed by counsel. See ADR 0002 → Phase 2 gate.'"
    status: pending
  - id: content
    content: "Adapt template language. ToS includes the explicit 'all images are reviewed before publication' clause + the moderation-decision path (approve / reject / appeal). Community Guidelines repeats the image-review clause and lists prohibited content (CSAM, sexual content involving minors, harassment, doxxing, etc.). Privacy policy lists what we collect (handle, display name, bio, email via Supabase Auth, EXIF-stripped images) and what we do NOT keep (GPS from images). Brand voice: Jettison (full word, never the verb)."
    status: pending
  - id: footer
    content: "app/_components/footer.tsx (server component): three text links (Terms / Community Guidelines / Privacy) + a small © Jettison + small note 'Template documents — not lawyer-reviewed at MVP'. Mobile-first stack, distinctive type scale. app/layout.tsx: import + render <Footer /> after {children}. Footer is sticky to the bottom via the existing min-h-full / flex-col body chrome."
    status: pending
  - id: verify
    content: "pnpm tsc --noEmit; pnpm lint; ReadLints clean on every touched file; manual curl /legal/terms /legal/community-guidelines /legal/privacy returns 200; manual curl / contains the footer markup; mobile viewport screenshot via dev server (optional). Report draft commit message + list of changed files."
    status: pending
isProject: false
---

# s3a.17 — template legal pages + footer

**Active Bead:** [`tripplanner-s3a.17`](#) — _infra: template ToS + Community Guidelines_, P1, parent `tripplanner-s3a`. No declared blockers.

**Bead AC (verbatim):** _Three docs live at /legal/terms, /legal/community-guidelines, /legal/privacy. 'All images reviewed' language present in ToS + Community Guidelines. Sign-up flow gates on accepting the ToS (checkbox + dated acceptance row). Footer links present in app chrome._

## Decisions made up-front

- **Defer the sign-up acceptance gate.** The "checkbox + dated acceptance row" half of the AC requires (a) a `tos_acceptances` table + RLS, (b) onboarding-flow modification, (c) a server action to record acceptance, and (d) a UI checkbox blocking submit. That's its own coherent slice and overlaps with `app/onboarding/handle/actions.ts` which is being touched by another parallel chunk (s3a.14). File as `tripplanner-s3a.24` and ship the pages + footer half here.
- **Pages are server components, no client JS.** Pure prose, fastest path. Distinctive type via Fraunces display + Inter body (already loaded in layout).
- **Top-of-page disclaimer on every legal page.** The bead description is explicit that nothing is lawyer-reviewed; surfacing this honestly to the reader is part of the design, not a hedge.
- **Single shared footer component.** `app/_components/footer.tsx` rather than inlining in `app/layout.tsx`, so future additions (a "Status" link, a "Help" link) don't bloat the layout.
- **Footer lives in `RootLayout`, not in `app/page.tsx`.** Means it shows on every route including `/onboarding/handle`, `/auth/callback`, future `/[handle]`. Acceptable: legal links should be reachable from anywhere.
- **Source material:** start from canonical templates — Stripe ToS, Discord Community Guidelines, Geneva ToS — adapted to Jettison's framing. Cite the templates in a comment in each page file so future legal review knows the lineage. Do NOT copy-paste verbatim; write Jettison-voice paraphrases that reflect the social + payments coupling.
- **No "jettison" verb in copy.** Per project-core, "jettison" is a marketing-only verb; legal copy uses "Jettison" as a proper noun ("Jettison may suspend your account...") and never the verb.
- **Mobile-first reading width.** `max-w-prose` (~65ch) on mobile, comfortable line height, generous margins. No tables-of-contents at MVP — these are short documents. Skim test target: organizer can read each in <2 minutes.
- **Single commit.** One coherent slice.

## Page outlines

### `app/legal/terms/page.tsx` — Terms of Service

Sections (h2s):
1. **What Jettison is.** Social network for group travel with payments built in. Asymmetric follow graph; trips are private, unlisted, or public. Money flows are member-only.
2. **Who can use Jettison.** 18+ at MVP. Ban list: prior banned users, sanctioned jurisdictions (placeholder — flag for legal Phase 2).
3. **Your account.** You own your handle subject to the squatting rules in the Community Guidelines. We may reclaim a dormant handle after [N] months of inactivity (placeholder).
4. **Content you post.** You retain ownership; you grant Jettison a non-exclusive license to display the content within Jettison. **Every image you upload is reviewed before publication** — see the Image Review section.
5. **Image Review.** Every image enters a private holding state, has its EXIF GPS data stripped, runs through automated CSAM scanning, and is reviewed by a human moderator before becoming visible to anyone other than you. Decision path: approve (visible per the trip / profile visibility) / reject (not visible; you can appeal once) / quarantine (legally required reporting). Typical SLA: under 24 hours at MVP.
6. **Money.** Trip costs are split between trip members. Jettison is not a bank, broker, or money transmitter at MVP — payments today are recorded inside Jettison; settlement happens via the configured payment provider (placeholder for the actual provider once `tripplanner-s3a.5`-equivalent payments slice ships). You are responsible for taxes on amounts you receive.
7. **What we may do.** Suspend, restrict, or terminate accounts that violate the Community Guidelines or these Terms. Remove content that violates the Image Review policy or the Community Guidelines. Cooperate with law enforcement under legal process.
8. **Disclaimers.** Jettison is provided "as is". No warranty.
9. **Limitation of liability.** Standard cap (placeholder for legal Phase 2).
10. **Changes to these Terms.** We'll notify you in-app and by email when material terms change.
11. **Governing law.** Placeholder (Delaware default — flag for legal Phase 2).
12. **Contact.** legal@jettison.app (placeholder).
13. **Last updated:** 2026-04-19.

### `app/legal/community-guidelines/page.tsx` — Community Guidelines

Sections:
1. **The short version.** Be the kind of trip-mate other people want to invite.
2. **Image Review.** Every uploaded image (profile avatars, post photos) is reviewed before publication. EXIF GPS is stripped. CSAM scanning runs automatically; CSAM is quarantined and reported per legal obligation.
3. **Prohibited content.** CSAM, sexual content involving minors, non-consensual intimate imagery, doxxing, targeted harassment, threats of violence, illegal activity, hate speech, sustained spam.
4. **Money behavior.** No payment laundering. No misrepresenting trip costs. No coercive collection tactics against trip-mates.
5. **Trip etiquette.** Public trips invite people; cold DMs to strangers are not allowed (mutual-context gating). Don't add costs without member visibility. Don't strand trip-mates with surprise charges.
6. **Reporting.** Use the Report button on any post, comment, profile, or DM. Reports are triaged by the moderator team.
7. **Enforcement.** First violation: warn. Repeated or severe: suspend. Egregious (CSAM, doxxing, coordinated harassment): immediate ban + legal escalation.
8. **Appeals.** One appeal per moderation decision. Reply to the moderation email.
9. **Last updated:** 2026-04-19.

### `app/legal/privacy/page.tsx` — Privacy Policy

Sections:
1. **What we collect.** Email (via Supabase Auth), handle, display name, bio, avatar (EXIF-stripped before storage), trip data you create or join, payment metadata (amounts, member shares, settlement timestamps — never raw card data), device + IP for security and rate limiting.
2. **What we do NOT keep.** GPS coordinates from your images (stripped on upload). Raw payment instruments (handled by the payment provider). Browsing telemetry beyond what's needed to operate the service.
3. **Where data lives.** Supabase (US, by default at MVP — placeholder, confirm region in production).
4. **Who can see what.** Money data is visible only to trip members regardless of social grant — see ADR 0002. Public trip itinerary, posts, photos are visible per their visibility setting. Your follower / following list is visible to whoever can see your profile.
5. **Third parties.** Supabase (database, auth, storage). Payment provider (TBD). Email provider (TBD). CSAM scanning vendor (TBD). Image moderation queue is staffed by Jettison employees + contractors under NDA.
6. **Your rights.** Export your data. Delete your account. Both routes go through Settings → Account at MVP (placeholder — flag).
7. **Children.** 18+ only at MVP.
8. **Changes.** Notified in-app and by email.
9. **Contact.** privacy@jettison.app (placeholder).
10. **Last updated:** 2026-04-19.

## Visual treatment

- Page chrome: full-bleed body with a centered article column at `max-w-prose mx-auto px-6 py-12`.
- Top banner inside each article: a small `bg-amber-100 text-amber-900 border border-amber-200 rounded-md px-4 py-3 text-sm` (or warm equivalent in the project palette) carrying the disclaimer. Use existing tokens — check `app/globals.css` `@theme` block; if no warm-amber token exists, use `bg-card border-hairline text-secondary` and prepend a small ⚠ glyph (avoid emoji per project-creative-design — use a Unicode ⚠ U+26A0 or a lucide icon if installed; otherwise a leading **Note —** label).
- Headings: `font-display text-2xl` for h1, `font-display text-lg` for h2.
- Body: `font-sans text-base leading-relaxed` (or `prose` if installed; do NOT add `@tailwindcss/typography` if it's not already installed — check `package.json` first).
- Last-updated stamp: `font-mono text-xs text-secondary tabular-nums` near the bottom.
- Mobile-first: looks great at 375px wide, scales up; no special desktop layout needed.

## Footer

- `app/_components/footer.tsx` (server component, no `"use client"`):
  - Layout: small horizontal bar at the bottom of the body. Mobile: stacks vertically.
  - Three `<Link>`s to `/legal/terms`, `/legal/community-guidelines`, `/legal/privacy`. Use `next/link`.
  - Below the links: `font-mono text-xs text-secondary` line — `Jettison · Template documents · Not lawyer-reviewed at MVP`.
  - Treatment: `border-t border-hairline px-6 py-6 text-sm text-secondary text-center` on mobile; `flex flex-row gap-6 justify-center` for the link row.
- `app/layout.tsx` modification: `import { Footer } from "@/app/_components/footer";` and insert `<Footer />` inside `<body>` after `{children}`. Body already has `min-h-full flex flex-col` — `{children}` should keep `flex-1` (it does via `app/page.tsx`'s `<main className="flex flex-1 ...">` pattern; verify the legal pages also use `flex-1` so the footer pins to the bottom).

## Bead bookkeeping (parent agent)

- **Create `tripplanner-s3a.24`** — _feat: ToS acceptance gate (checkbox + dated acceptance row)_, P1, parent `s3a`, deps `blocked-by:tripplanner-s3a.17`. Acceptance: `tos_acceptances (profile_id, version, accepted_at)` table + RLS (own rows only); onboarding flow gates on a checkbox; checkbox links to `/legal/terms`; submit fails if unchecked; acceptance row inserted on submit.
- **Close `tripplanner-s3a.17`** with a "pages + footer shipped; gate deferred to s3a.24" summary note.

## Verification

- `pnpm tsc --noEmit` clean.
- `pnpm lint` clean.
- `ReadLints` clean on every touched file.
- `curl -sI http://localhost:3000/legal/terms`, `…/legal/community-guidelines`, `…/legal/privacy` — all `200`. (Dev server is currently running on port 3000 from the prior session; if it's down, the subagent should NOT start it — the parent agent will handle smoke testing.)
- `curl -s http://localhost:3000/ | grep -i 'community-guidelines'` — confirms the footer markup ships on the home page too.
- `rg -i "jettison your" app/legal/` — should return zero matches (no verb usage).

## Subagent instructions

- Implement everything above. Do NOT git commit. Do NOT do bead bookkeeping (parent agent handles).
- Do NOT start the dev server. If you need to verify routes, the parent agent will smoke-test.
- Report back: (1) list of changed files, (2) draft commit message body using the s3a.2 commit style, (3) any places where you couldn't find an existing token / utility and made one up — flag them.
