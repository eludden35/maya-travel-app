// Source lineage: adapted from Stripe ToS, Discord Community Guidelines, and
// Geneva ToS templates, paraphrased into Jettison's social + payments
// framing. No verbatim copy. See `.cursor/plans/s3a17_legal_pages.plan.md`
// for section outline. Treat as template-grade until counsel review at the
// Phase 2 gate (see `docs/adr/0002-social-vision-pivot.md`).

import type { Metadata } from "next";
import type { ReactNode } from "react";

const LAST_UPDATED = "2026-04-19";

export const metadata: Metadata = {
  title: "Terms of Service · Jettison",
  description:
    "Template Terms of Service for Jettison — the social network for group travel with payments built in.",
};

export default function TermsOfServicePage() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-12 bg-paper text-ink">
      <article className="w-full max-w-prose flex flex-col gap-10">
        <header className="flex flex-col gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
            Jettison · Legal
          </p>
          <h1 className="font-display text-3xl sm:text-4xl leading-tight">
            Terms of Service
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

        <Section number="01" heading="What Jettison is">
          <p>
            Jettison is a social network for group travel with payments built
            in. You can follow other people, plan trips together, post photos
            and notes from those trips, and split the money so no one fronts
            the bill. Trips are private, unlisted, or public; what is visible
            at each level is described in our Privacy Policy.
          </p>
          <p>
            Money data — expenses, shares, and settlement — is{" "}
            <strong className="font-medium text-ink">
              only ever visible to members of the trip it belongs to
            </strong>
            , regardless of trip visibility or any follow relationship. A
            public trip shares its itinerary, posts, and photos; it never
            shares amounts.
          </p>
        </Section>

        <Section number="02" heading="Who can use Jettison">
          <p>
            You must be at least 18 years old to use Jettison at MVP. You may
            not use Jettison if a previous account of yours has been banned,
            if you are barred from receiving services under applicable export
            controls or sanctions, or if you are in a jurisdiction Jettison
            cannot lawfully serve.
          </p>
          <p className="text-secondary text-sm">
            Specific jurisdictions and the under-18 path are placeholder
            pending Phase 2 legal review.
          </p>
        </Section>

        <Section number="03" heading="Your account">
          <p>
            You pick a handle when you join. The handle is yours subject to
            the squatting rules in our Community Guidelines. If an account
            sits dormant for an extended period, Jettison may reclaim the
            handle so that someone else can use it; we will give you advance
            notice by email before doing so.
          </p>
          <p className="text-secondary text-sm">
            The exact dormancy threshold is a placeholder for the Phase 2
            handle-reclaim policy.
          </p>
        </Section>

        <Section number="04" heading="Content you post">
          <p>
            You keep ownership of the photos, notes, comments, and other
            content you post. By posting, you grant Jettison a non-exclusive,
            worldwide, royalty-free license to host, store, transmit, and
            display your content within Jettison so we can run the service.
            The license ends when you delete the content, except for backups
            we have to keep for a reasonable rolling window for safety and
            recovery.
          </p>
          <p>
            Every image you upload is reviewed before publication. See the
            next section for what that means in practice.
          </p>
        </Section>

        <Section number="05" heading="Image review">
          <p>
            When you upload an image — a profile avatar, a trip post photo,
            anything else — it enters a private holding state and is{" "}
            <strong className="font-medium text-ink">
              invisible to everyone but you
            </strong>{" "}
            until it is approved. While it is in holding we strip the GPS
            coordinates from its EXIF metadata, run automated CSAM scanning,
            and route it to a human moderator for review.
          </p>
          <p>
            The moderator does one of three things. They{" "}
            <strong className="font-medium text-ink">approve</strong> the
            image, and it becomes visible per the visibility setting of the
            surrounding trip or profile. They{" "}
            <strong className="font-medium text-ink">reject</strong> it, in
            which case it stays invisible to everyone but you and the
            moderator, and you may appeal once by replying to the moderation
            email. Or they{" "}
            <strong className="font-medium text-ink">quarantine</strong> it,
            which we are legally required to do for content like CSAM, and
            we report it to the appropriate authorities.
          </p>
          <p>
            The target turnaround at MVP is under 24 hours. Throughput will
            get faster as our automated pre-classification matures, but the
            human review step is not optional.
          </p>
        </Section>

        <Section number="06" heading="Money">
          <p>
            Trip costs are recorded inside Jettison and split between trip
            members. Jettison itself is not a bank, broker, money
            transmitter, or licensed payment institution at MVP — settlement
            happens through a third-party payment provider, and the funds
            flow under that provider&rsquo;s terms in addition to these.
          </p>
          <p>
            You are responsible for any taxes you owe on amounts you receive
            through the service. You are also responsible for the accuracy
            of any cost you add to a trip — please do not record costs you
            did not actually incur.
          </p>
          <p className="text-secondary text-sm">
            The payment provider is a placeholder until the payments slice
            ships.
          </p>
        </Section>

        <Section number="07" heading="What we may do">
          <p>
            Jettison may suspend, restrict, or terminate an account that
            violates these Terms or the Community Guidelines. Jettison may
            remove content that violates the image review policy or the
            Community Guidelines. Jettison cooperates with law enforcement
            where required by valid legal process and pushes back where the
            process is overbroad or the request is unlawful.
          </p>
        </Section>

        <Section number="08" heading="Disclaimers">
          <p>
            Jettison is provided on an &ldquo;as is&rdquo; and &ldquo;as
            available&rdquo; basis, without warranties of any kind, express
            or implied. We do our best to keep the service running and your
            data safe, but we cannot guarantee zero downtime, zero loss, or
            that the service will meet every expectation.
          </p>
        </Section>

        <Section number="09" heading="Limitation of liability">
          <p>
            To the maximum extent permitted by law, neither Jettison nor
            anyone working with us is liable for indirect, incidental,
            special, consequential, or punitive damages arising out of your
            use of the service. Our total liability is capped at the greater
            of the amounts you paid Jettison in the twelve months before the
            claim arose, or one hundred U.S. dollars.
          </p>
          <p className="text-secondary text-sm">
            Cap and carve-outs are placeholder pending Phase 2 legal review.
          </p>
        </Section>

        <Section number="10" heading="Changes to these Terms">
          <p>
            When we make material changes to these Terms, we will let you
            know in-app and by email at least seven days before the changes
            take effect. If you keep using Jettison after the changes are in
            effect, you accept the updated Terms. If you do not, you can
            close your account; doing so will not erase obligations that
            arose before the changes.
          </p>
        </Section>

        <Section number="11" heading="Governing law">
          <p>
            These Terms are governed by the laws of the State of Delaware,
            without regard to its conflict-of-law rules. Disputes go to the
            state and federal courts located in Delaware, except where local
            consumer-protection law gives you a non-waivable right to a
            different forum.
          </p>
          <p className="text-secondary text-sm">
            Forum and jurisdiction are placeholder pending Phase 2 legal
            review.
          </p>
        </Section>

        <Section number="12" heading="Contact">
          <p>
            Questions about these Terms? Write to{" "}
            <a
              className="underline decoration-hairline underline-offset-4 hover:text-ink"
              href="mailto:legal@jettison.app"
            >
              legal@jettison.app
            </a>
            .
          </p>
          <p className="text-secondary text-sm">
            The legal@ inbox address is a placeholder until the production
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
