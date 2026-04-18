# 0002. Social vision pivot: Jettison is a social network for group travel, with payments built in

- Date: 2026-04-18
- Status: Accepted

## Context

[ADR 0001](0001-framework-choice.md) locked the stack (Next.js 16 App Router + TypeScript + Tailwind v4 + `@supabase/ssr` + Vercel) for an MVP framed in [`AGENTS.md`](../../AGENTS.md) and [`app-context/product-engineering.md`](../../app-context/product-engineering.md) as a **transactional** group-payments product:

> _Jettison is the mobile-first way for groups to plan, split, and settle shared trips and events — so no one fronts the money or chases anyone afterward._

The original MVP loop was **trip → people → costs → split → pay**, with explicit OUT-of-scope items: social feed, public trips, BNPL, native mobile clients, vendor marketplace.

Mid-conversation with the founder, the product framing changed. The founder's current intent is **a social network focused on group travel** — like Facebook in interaction model, but vertical to trips: profiles, follows, in-trip posts with photos, comments, reactions, public trip discovery, an explore tab, joining strangers' trips, and direct messages. Payments remain core, but they become the moat ("the only travel social network where the money actually moves") rather than the headline.

The founder's stated guidance shaped the constraints:

- "**Easiest to adopt**" — the friction floor for a new user joining the product should be low.
- "**Don't worry too much about moderation until traction**" — modulated by the architecture lens (see "Decision" below); some moderation pieces are deferrable, others are not.
- "**There should def be public trip discovery, explore tab and joining strangers trips and dms**" — public surfaces are first-class in MVP, not Phase 2.
- "**All images must be reviewed first. In the beginning they will be manually reviewed by moderator, but in the future using AI**" — strict pre-moderation on every uploaded image, founder-triaged at MVP, AI auto-classification as a follow-up that raises throughput, never lowers the safety floor.
- "**Always come up with unique and creative designs that are distinct and fun**" — Facebook is a reference for which interaction patterns work; never a template for visual treatment.

This ADR records the resulting pivot, the deliberate trade-offs, and the gates that protect future-Jettison from quietly relaxing them.

## Decision

We pivot Jettison's product vision from a **transactional group-payments app with social explicitly OUT of MVP** to a **social network for group travel with payments built in**, with the following four pillars in MVP:

### 1. Full social surface in MVP

- Profiles (handle, display name, avatar, bio).
- Asymmetric follow graph (Instagram-style; no symmetric "friend request").
- Trip visibility enum: `private` | `unlisted` | `public`. Public trips appear in the explore feed and accept join requests.
- In-trip posts (text + photos), comments, reactions.
- Followers feed (chronological — no algorithm in MVP).
- Explore tab (public trips, "recent + popular" ordering — no algorithm in MVP).
- Join requests on public trips, **approval-required by default**; a per-trip "auto-approve" flag exists but is hidden behind a feature flag at launch.
- Direct messages with **mutual-context gating** (see Pillar 3).
- Notifications (new follower, post in your trip, comment, reaction, payment received, join request, new DM).
- The original payments flow (expenses, shares, peer-to-organizer payouts) is unchanged.

### 2. Strict pre-moderation on every uploaded image

This is the most consequential rule in this ADR. **No uploaded image becomes visible to anyone but the uploader until a human moderator approves it.** Applies to Post images, Profile avatars, and any future user-uploaded image surface.

The pipeline:

1. User uploads → image lands in a private storage path readable only by the uploader and the moderator role.
2. Server-side **EXIF GPS strip** runs immediately (privacy floor — otherwise photos leak users' homes).
3. **CSAM scan** runs (vendor TBD: Sightengine / Hive / Microsoft PhotoDNA via partner — chosen by the implementation Bead). Hits are quarantined, logged, and reported per legal obligation.
4. Image enters `pending_review` state in the DB. The parent Post sits in `pending_media` and is invisible to everyone except the author, who sees an on-brand "your postcard is in the mail" treatment with an expectation-set ("typically reviewed within 24 hours").
5. **Manual moderator review** in a lightweight founder-only admin UI: approve / reject with a reason code from a small fixed list, keyboard-driven for triage speed.
6. Approved → image moves to a public-readable path, Post flips to `published`, notifications fire.
7. Rejected → uploader gets a notification with the reason ("returned to sender"); rejected image retained for an audit window then deleted.

Both **CSAM scanning** and the **manual moderator queue UI** are P0 gates with the `gate` + `moderation` Beads labels. **Posts cannot ship before both gates close.** Any future relaxation requires an ADR superseding this one.

Text content (Posts, Comments, DMs) is **not** pre-moderated in MVP. Only images.

Throughput cost is honest: ~30–60 seconds of human time per image. At ~200 images/day that's ~2–3 hours/day of moderator (founder) time. This caps growth until **AI auto-classification** lands as a top-of-funnel filter — high-confidence safe images auto-approve, ambiguous cases route to the human queue. AI raises the throughput ceiling; **AI never lowers the safety floor.** Filed as a P1 follow-up Bead, not deferred to Phase 2.

### 3. Two cheap structural safety levers (no ops cost)

Both ship in MVP because they cut the abuse surface ~90% with zero ongoing operational cost:

- **Mutual-context DMs only.** Profile A can DM Profile B iff at least one of: (a) they mutually follow each other, (b) they share a Trip as members, or (c) they have an open join request between them. Cold DMs from strangers are not possible. Mirrors what Instagram, BeReal, Strava, Geneva all do; users do not perceive this as a limitation.
- **Approval-required join requests by default.** Organizer approves each join. The "auto-approve" per-trip flag exists but is feature-flagged off at launch.

Together, these prevent the two most common stranger-abuse vectors (cold DMs and unmoderated joins) without requiring a moderation team.

### 4. Lean operational moderation baseline

Beyond pre-moderation, the operational baseline is intentionally minimal:

- **Block + mute** primitives on Profile, Post, Comment, DM. Block = full mutual invisibility + cannot DM; mute = silently hide.
- **Report flow** that funnels into the same triage queue the moderator already works (Posts, Comments, Profiles, Trips, DMs all reportable).
- **Rate limiting** on Posts (incl. uploads), Comments, Follows, DMs, join requests — cheap insurance against spam bots and queue-flooding.
- **Template ToS + Community Guidelines** written from known-good templates (Stripe / Discord / Geneva as starting points), with explicit "all images are reviewed before publication" language. Not lawyer-reviewed at MVP.

### 5. Visibility / privacy hard rules

These survive every future change unless explicitly superseded by another ADR:

- **Posts inherit the parent Trip's visibility.** Posts in private trips are members-only; posts in public trips are world-readable.
- **Money data (`expenses`, `expense_shares`, `payouts`, anything monetary) is never readable by non-trip-members regardless of trip visibility, follower relationship, or any other social grant.** Public trips show itinerary, photos, and posts — never amounts owed or paid. This is the hardest line in the system and lands as a checklist item in [`.cursor/rules/supabase-security.mdc`](../../.cursor/rules/supabase-security.mdc) and [`.cursor/rules/project-review-checklist-sql.mdc`](../../.cursor/rules/project-review-checklist-sql.mdc).
- **Every uploaded image is invisible to anyone but the uploader until approved.** Same enforcement layers as above.
- **Profiles are world-readable by default.** Users may flip to "followers + co-trip-members only" via a settings toggle (toggle is P2; the column ships in MVP).

### 6. Phase 2 gates (deferred work, fires when the gate criterion hits)

The following are deferred to a Phase 2 epic. Each has a numeric gate criterion so promotion is not vibes-based:

| Phase 2 work | Gate criterion |
|---|---|
| Lawyer-reviewed ToS + Community Guidelines + privacy policy | **5,000 MAU** OR first abuse incident with material exposure (whichever first) |
| Dedicated trust & safety operating model (24/7 triage, on-call, formal SLAs, secondary moderator hires) | **25,000 MAU** OR ToS lawyer recommends earlier |
| Algorithmic feed ranking (replace chronological) | Chronological feed measurably hurting retention |
| Stories / ephemeral content, live video, influencer monetization tools | No hard gate — re-evaluate post-MVP |

The 5k / 25k MAU thresholds are placeholders. They can be re-tuned via a follow-up Bead once we have actual usage data; tuning does not require a new ADR.

### 7. Design language: distinctive by default, Facebook by reference only

Facebook, Instagram, BeReal, Geneva, Partiful, Letterboxd, and Strava are studied as **references for which interaction patterns work in social UX** — feed structure, composer affordances, follow flows, comment threading, notification design. Their **patterns** inform our defaults. Their **visual treatments are never copied.** Every social surface — feed, post composer, profile, follow, comment, reaction, DM, notification, explore — is re-rendered through Jettison's distinctive design language (warm/tactile/considered/quietly-confident; Ink/Ember/Paper palette; Fraunces+Inter+JetBrains Mono).

The seven concrete starting sketches that orient the design Bead live in [`.cursor/skills/project-ui-ux/SKILL.md`](../../.cursor/skills/project-ui-ux/SKILL.md) under "Social surfaces — distinctive by default":

1. Post composer = trip postcard (not a "What's on your mind?" box).
2. Feed structured by Trip as the unit of consumption (not a flat firehose).
3. Reactions = small custom-illustrated travel-themed glyphs (not thumbs/hearts/emoji).
4. Pending-review state = "your postcard is in the mail" (not a punitive gray box).
5. DMs = trip notes (not iMessage chat bubbles).
6. Explore = map-first with cards floating over destinations (not an Instagram grid).
7. Notifications = Ember pennants (not red dots).

Anti-pattern shortlist (also in [`.cursor/rules/project-creative-design.mdc`](../../.cursor/rules/project-creative-design.mdc)): generic blue-rectangle composer, Instagram-grid explore, thumbs-up/heart reactions, red notification badges, iMessage-style chat bubbles, Material FABs, gradient-blob landing, emoji-pile reaction bars.

## Alternatives considered

### Option A — Stay transactional-only (status quo before this ADR)

**Pros:**

- Smallest MVP surface area; ~3-month timeline to a real product.
- Zero moderation surface — no UGC, no DMs, no public anything.
- Cleanest investor pitch — transactional fintech for groups is a known, underwriteable category.
- Lowest risk on day one; first real abuse incident is years away.

**Cons (decisive):**

- Doesn't match the founder's stated product vision. The founder explicitly identified the social/discovery layer as a key part of why the product exists.
- The product becomes a feature ("Splitwise but for trips") rather than a category. Splitwise itself, plus group payments built into Venmo / Cash App, would compete on the same axis.
- Forecloses the network-effect moat — once the social surface ships, payments become a stickier feature, not the standalone product.

### Option B — Closed/friends-only social, public discovery in Phase 2 (initial recommendation)

**Pros:**

- ~80% lower moderation cost than full social (no public posts visible to strangers, no cold DMs).
- ~6-month MVP timeline.
- Mirrors what BeReal, Geneva, Partiful did successfully early — friends-only social earns the right to public discovery later.

**Cons (decisive):**

- Founder explicitly rejected this option ("there should def be public trip discovery, explore tab and joining strangers trips and dms").
- Removes the "discoverable trips you can join" wedge that differentiates from existing planning apps (Let's Jetty et al.) and from existing payment splitters (Splitwise).

### Option C — Full social MVP with light post-publish moderation (publish + report + take down)

**Pros:**

- Easiest to ship; lowest perceived friction for users.
- Most existing social apps started here.
- Lowest-latency posting (no review wait).

**Cons (decisive):**

- The "first abuse incident is a screenshot on Twitter" failure mode is well-documented across vertical social apps. For a small founder-run product, one viral incident can be terminal.
- Founder explicitly chose stricter moderation: "all images must be reviewed first."
- CSAM scanning is a US legal floor regardless of moderation posture; post-publish moderation does not relax this requirement.

### Option D — Full social MVP with strict pre-moderation (chosen)

**Pros:**

- Honors the founder's product vision (full social surface in MVP).
- Honors the founder's moderation posture ("all images reviewed first").
- The two cheap structural safety levers (mutual-context DMs, approval-required joins) cut the abuse surface ~90% without ongoing ops cost.
- Pre-moderation is the strongest stance short of disabling photo uploads — protects the brand against "first abuse incident kills the product" risk.
- Sets the right ceiling-not-floor framing for AI: AI raises throughput later; the human review floor is permanent.

**Cons (acknowledged):**

- **Moderation throughput is a hard cap on growth.** ~200 images/day = ~2–3 hours/day of founder time. Until AI auto-classification ships, founder time spent moderating is founder time not spent on product / sales / support. The AI follow-up Bead is therefore P1, not P3.
- **Posting latency is user-visible** (~24h expectation set). Mitigated by treating it as on-brand ritual ("your postcard is in the mail") rather than as a friction message.
- **MVP timeline grows from ~3 months (Option A) to ~6–9 months.** The founder has been told this and is accepting the trade.

### Option E — Full social MVP with strict pre-moderation but visual mimicry of Facebook/Instagram

**Pros:** fastest to design; familiar to users.

**Cons (decisive):** explicitly rejected by the founder ("always come up with unique and creative designs that are distinct and fun"). Generic-clone is also a death sentence in vertical social — there's no reason for users to switch from the incumbent if the new product looks like a clone.

## Consequences

### Easier

- **Founder vision is now codified** — the rest of the docs, rules, skills, and Beads inherit a single coherent story instead of fragmenting between "transactional MVP" copies and "social MVP" intent.
- **Architecture has a clear north star** for the next several chunks — the social-platform foundation epic (and its 18 sub-Beads) gives the work a clear shape.
- **Money privacy hard rule** is now explicit and review-checked, reducing the chance that a future migration accidentally exposes financial data through a social RLS pattern.
- **Image moderation hard rule** is enforced at three layers (security rule, SQL review checklist, P0 Beads gates on Posts) — the rule is hard to silently relax.
- **Design discipline for social surfaces** is encoded with concrete starting sketches, anti-patterns, and a cross-link between the UI/UX skill and the creative-design rule. The "social surfaces silently regress to Facebook clone" failure mode is mitigated.

### Harder

- **MVP scope ~3× larger.** Realistic timeline grows from ~3 months to ~6–9 months. Founder time pre-launch is the binding constraint; not much we can do about that beyond acknowledging it honestly in the project docs.
- **Founder time moderating** becomes a daily commitment until AI ships. We've made AI auto-classification P1 to compress that window.
- **Architecture surface area** for the social/RLS model is materially more complex than transactional-only — public-content RLS patterns, image moderation state machine, two-tier storage paths, DM gating predicate. New patterns documented in the architecture skill update; future agents have the references.
- **Two-mode design system** (money mode + content mode) is new mental model for the design Bead. Same pillars/palette/type, two layout grammars.
- **Phase 2 gate discipline** has to hold. If we drift into "we're at 4k MAU let's just ship live video first," we will have shipped operational scale-out work behind un-reviewed legal terms. The numeric gate criteria + `phase-2` Beads label are the mitigation.

### Existing rules / skills / docs this implies

- **New rule content** in [`.cursor/rules/supabase-security.mdc`](../../.cursor/rules/supabase-security.mdc) (two hard rules: money-data privacy + image pre-moderation).
- **New rule content** in [`.cursor/rules/project-review-checklist-sql.mdc`](../../.cursor/rules/project-review-checklist-sql.mdc) (corresponding checklist items).
- **New rule content** in [`.cursor/rules/project-creative-design.mdc`](../../.cursor/rules/project-creative-design.mdc) (social-surface anti-patterns + "reference Facebook patterns, never copy visuals" hard rule).
- **Updated** [`.cursor/rules/project-core.mdc`](../../.cursor/rules/project-core.mdc) — short social-first note + ADR 0002 cite.
- **Updated** [`.cursor/skills/project-architecture/SKILL.md`](../../.cursor/skills/project-architecture/SKILL.md) — public-content RLS patterns, image upload + pre-moderation pipeline, moderator role + queue access, DM gating implementation sketch.
- **Updated** [`.cursor/skills/project-ui-ux/SKILL.md`](../../.cursor/skills/project-ui-ux/SKILL.md) — money-mode vs content-mode, "Social surfaces — distinctive by default" with the seven sketches, pending-review UX.
- **Updated** [`.cursor/skills/project-domain/SKILL.md`](../../.cursor/skills/project-domain/SKILL.md) — new entities (Profile / Follow / Visibility / Post / Comment / Reaction / Notification / Moderation Decision / Report); new social user stories.
- **Updated** [`.cursor/skills/project-pm/SKILL.md`](../../.cursor/skills/project-pm/SKILL.md) — refreshed IN/OUT examples; open-decisions list reflects this ADR.
- **Updated** [`AGENTS.md`](../../AGENTS.md) and [`app-context/product-engineering.md`](../../app-context/product-engineering.md) — new one-liner, expanded MVP scope, image moderation pipeline, DM gating rule, Phase 2 phasing.
- **Note added** to [`app-context/initial-app-idea.md`](../../app-context/initial-app-idea.md) — historical brainstorm, canonical scope now in `product-engineering.md` per this ADR.

### No code in this chunk

This ADR ships with **no feature code**. New tables, RLS policies, components, and UI all live in the social-platform foundation Beads epic and its sub-tasks. The chunk is doc + rule + skill + Beads alignment only.

## Follow-ups

### New MVP Beads epic (filed in this chunk)

`epic: social platform foundation (full social MVP — public discovery + DMs)` — P1 parent, label `social`. Sub-tasks:

- `feat: profiles + handles + avatars` — P1 (avatars go through the moderation pipeline).
- `feat: follow graph (asymmetric)` — P1, blocked-by profiles.
- `feat: trip visibility model (private | unlisted | public) + RLS` — P1.
- `infra: photo storage pipeline + pending_review state machine` — P1.
- `infra: CSAM scanning integration` — **P0 gate**, blocked-by photo storage; labels `gate`, `moderation`.
- `infra: manual moderator queue UI (founder-only)` — **P0 gate**, blocked-by photo storage; labels `gate`, `moderation`.
- `feat: trip Posts (text + photos, photos held in pending_review)` — P1, blocked-by photo storage + CSAM + moderator queue UI.
- `feat: comments + reactions on Posts` — P2, blocked-by Posts.
- `feat: in-app notifications` — P2.
- `feat: followers feed (chronological)` — P2, blocked-by follow + Posts.
- `feat: explore tab` — P2, blocked-by trip visibility.
- `feat: join requests (approval-required default + auto-approve flag, feature-flagged off)` — P2, blocked-by trip visibility.
- `feat: DMs with mutual-context gating` — P2, blocked-by follow + trip visibility + Posts.
- `infra: rate limiting` — P1.
- `infra: report flow → existing moderator queue` — P1, blocked-by moderator queue UI.
- `infra: block + mute primitives` — P1.
- `infra: template ToS + Community Guidelines` — P1.
- `design: money-mode vs content-mode layout system + distinctive social-surface kit` — P2.
- `design: custom reaction glyph set` — P2.
- `design: Mapbox/MapLibre custom style in Jettison palette` — P2.

### MVP follow-up Bead (filed in this chunk)

- `infra: AI auto-classification on uploaded images (raises throughput; never replaces human floor)` — **P1**, blocked-by manual moderator queue UI; label `moderation`. Vendor TBD.

### New Phase 2 Beads epic (filed in this chunk; P3, label `phase-2`)

- `infra: lawyer-reviewed ToS + Community Guidelines + privacy policy` — gate: 5k MAU OR material abuse incident.
- `ops: trust & safety operating model (24/7 triage, on-call, SLAs, secondary moderator hires)` — gate: 25k MAU OR ToS lawyer recommends earlier.
- `feat: algorithmic feed ranking` — gate: chronological hurts retention.
- `feat: stories / ephemeral content` — no hard gate; re-evaluate.
- `feat: live video` — no hard gate; re-evaluate.
- `feat: influencer monetization tools` — no hard gate; re-evaluate.

### Existing Beads notes

- [`tripplanner-bah`](#) — note appended: the trivial profiles table from its original scope is **superseded** by the social-platform `profiles` schema landing under the new epic. Don't close yet; close-or-pivot decision when the new profiles task is picked up.
- [`tripplanner-581`](#) — note appended: payments now layer on top of the social identity model (Profile owns the payment relationship, not raw `auth.users`). Scope unchanged otherwise.

### Repo / brand renames

Unaffected by this ADR. Tracked under [`tripplanner-p95`](#) (repo + npm package rename to `jettison`) and [`tripplanner-229`](#) (Beads prefix re-init to `jtsn`/`jet`). Not pulled forward in this chunk.
