// Source lineage: adapted from Discord Community Guidelines and the Geneva
// community policy templates, paraphrased into Jettison's voice. No verbatim
// copy. The image-review language is duplicated verbatim with the Terms of
// Service section 05 on purpose — both surfaces should be reachable
// independently and tell the same story. See
// `.cursor/plans/s3a17_legal_pages.plan.md`.

import type { Metadata } from "next";
import type { ReactNode } from "react";

const LAST_UPDATED = "2026-04-19";

export const metadata: Metadata = {
  title: "Community Guidelines · Jettison",
  description:
    "Template Community Guidelines for Jettison — the social network for group travel with payments built in.",
};

export default function CommunityGuidelinesPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-12 bg-paper text-ink">
      <article className="w-full max-w-prose flex flex-col gap-10">
        <header className="flex flex-col gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
            Jettison · Legal
          </p>
          <h1 className="font-display text-3xl sm:text-4xl leading-tight">
            Community Guidelines
          </h1>
          <p className="font-mono text-xs text-secondary tabular-nums">
            Last updated <span className="text-ink">{LAST_UPDATED}</span>
          </p>
        </header>

        <aside
          role="note"
          aria-label="Disclaimer"
          className="rounded-md border border-hairline bg-card px-4 py-3 text-sm text-secondary"
        >
          <span className="font-mono uppercase tracking-[0.15em] text-xs text-ink">
            Note —
          </span>{" "}
          Template document, not yet reviewed by counsel. See{" "}
          <span className="font-mono text-xs text-ink">ADR 0002</span> for
          the Phase 2 legal-review gate.
        </aside>

        <Section number="01" heading="The short version">
          <p>
            Be the kind of trip-mate other people want to invite back. Most
            of what follows is a longer way of saying that.
          </p>
        </Section>

        <Section number="02" heading="Image review">
          <p>
            Every image you upload — profile avatars, post photos, anything
            else — is reviewed before it becomes visible to anyone other than
            you. We strip the GPS coordinates from each image&rsquo;s EXIF
            metadata on upload, run automated CSAM scanning, and route the
            image to a human moderator. Decisions land as approve, reject,
            or quarantine; CSAM is quarantined and reported to the
            appropriate authorities under our legal obligations.
          </p>
          <p>
            The target turnaround is under 24 hours at MVP. While an image
            is in review, it is invisible to your followers, to the other
            members of the trip it belongs to, and to organizers — no
            exceptions.
          </p>
        </Section>

        <Section number="03" heading="Prohibited content">
          <p>You may not post, share, or solicit:</p>
          <ul className="flex flex-col gap-2 pl-5 list-disc marker:text-muted">
            <li>
              Child sexual abuse material (CSAM) or any sexual content
              involving minors. This is reported, not just removed.
            </li>
            <li>
              Non-consensual intimate imagery, including deepfakes and
              &ldquo;upskirt&rdquo;-style content.
            </li>
            <li>
              Doxxing — publishing someone&rsquo;s home address, phone
              number, employer, or other private identifiers without their
              clear consent.
            </li>
            <li>
              Targeted harassment, threats of violence, or coordinated
              campaigns against an individual or group.
            </li>
            <li>
              Hate speech directed at people on the basis of who they are.
            </li>
            <li>
              Content depicting or facilitating serious illegal activity.
            </li>
            <li>
              Sustained spam, scams, or follower-farming behavior.
            </li>
          </ul>
        </Section>

        <Section number="04" heading="Money behavior">
          <p>
            Jettison handles money between people who already know each
            other, which makes it an attractive target for misuse. Don&rsquo;t
            be the misuse:
          </p>
          <ul className="flex flex-col gap-2 pl-5 list-disc marker:text-muted">
            <li>
              No payment laundering — Jettison is not a clearing house for
              money flowing through unrelated trips.
            </li>
            <li>
              Don&rsquo;t misrepresent trip costs. The amount on the trip
              should match the amount you actually paid.
            </li>
            <li>
              Don&rsquo;t use coercive collection tactics against trip-mates.
              Late or disputed shares are a conversation, not a threat.
            </li>
          </ul>
        </Section>

        <Section number="05" heading="Trip etiquette">
          <p>
            Public trips invite people to ask to join; that is the front door.
            Cold direct messages from strangers are not a valid front door —
            DMs are gated to people you both follow, share a trip with, or
            have an open join request with.
          </p>
          <p>
            Inside a trip, costs you add are visible to other members. Add
            them honestly and promptly. Don&rsquo;t strand trip-mates with
            surprise charges that show up after the trip is over and
            settled.
          </p>
        </Section>

        <Section number="06" heading="Reporting">
          <p>
            Use the Report control on any post, comment, profile, or DM that
            crosses a line. Reports go to the moderator team for triage —
            you don&rsquo;t need to mention the violation in a public reply.
          </p>
        </Section>

        <Section number="07" heading="Enforcement">
          <p>
            We try to match the response to the violation:
          </p>
          <ul className="flex flex-col gap-2 pl-5 list-disc marker:text-muted">
            <li>
              <strong className="font-medium text-ink">First, minor:</strong>{" "}
              a warning and the chance to fix the post or behavior.
            </li>
            <li>
              <strong className="font-medium text-ink">
                Repeated or serious:
              </strong>{" "}
              a temporary suspension that scales with the pattern.
            </li>
            <li>
              <strong className="font-medium text-ink">
                Egregious — CSAM, doxxing, coordinated harassment, fraud:
              </strong>{" "}
              an immediate ban and, where appropriate, escalation to law
              enforcement.
            </li>
          </ul>
        </Section>

        <Section number="08" heading="Appeals">
          <p>
            You get one appeal per moderation decision. Reply to the
            moderation email with the context you want considered; a
            different moderator reviews the appeal.
          </p>
        </Section>

        <Section number="09" heading="Contact">
          <p>
            Trust and safety questions go to{" "}
            <a
              className="underline decoration-hairline underline-offset-4 hover:text-ink"
              href="mailto:safety@jettison.app"
            >
              safety@jettison.app
            </a>
            .
          </p>
          <p className="text-secondary text-sm">
            The safety@ inbox address is a placeholder until the production
            domain is live.
          </p>
        </Section>
      </article>
    </main>
  );
}

function Section({
  number,
  heading,
  children,
}: {
  number: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
        Section {number}
      </p>
      <h2 className="font-display text-xl sm:text-2xl leading-snug">
        {heading}
      </h2>
      <div className="flex flex-col gap-3 text-base leading-relaxed">
        {children}
      </div>
    </section>
  );
}
