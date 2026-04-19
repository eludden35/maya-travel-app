// Source lineage: adapted from Stripe and Geneva privacy-policy templates,
// paraphrased into Jettison's social + payments framing. No verbatim copy.
// The "money data is never visible to non-trip-members" hard rule is from
// `docs/adr/0002-social-vision-pivot.md` and is repeated on the Terms page
// on purpose. See `.cursor/plans/s3a17_legal_pages.plan.md`.

import type { Metadata } from "next";
import type { ReactNode } from "react";

const LAST_UPDATED = "2026-04-19";

export const metadata: Metadata = {
  title: "Privacy Policy · Jettison",
  description:
    "Template Privacy Policy for Jettison — what we collect, what we never keep, and who can see what.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-12 bg-paper text-ink">
      <article className="w-full max-w-prose flex flex-col gap-10">
        <header className="flex flex-col gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
            Jettison · Legal
          </p>
          <h1 className="font-display text-3xl sm:text-4xl leading-tight">
            Privacy Policy
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

        <Section number="01" heading="What we collect">
          <p>To run Jettison we collect:</p>
          <ul className="flex flex-col gap-2 pl-5 list-disc marker:text-muted">
            <li>
              <strong className="font-medium text-ink">Your account.</strong>{" "}
              Email address (via Supabase Auth), handle, display name, and
              optional bio.
            </li>
            <li>
              <strong className="font-medium text-ink">Your avatar.</strong>{" "}
              Stored only after EXIF GPS metadata is stripped on upload.
            </li>
            <li>
              <strong className="font-medium text-ink">Trip data.</strong>{" "}
              Trips you create or join, the members on them, the posts and
              photos you publish to them.
            </li>
            <li>
              <strong className="font-medium text-ink">
                Payment metadata.
              </strong>{" "}
              Amounts, member shares, and settlement timestamps.{" "}
              <em>Never</em> raw card numbers, bank credentials, or other
              payment instruments — those stay with the payment provider.
            </li>
            <li>
              <strong className="font-medium text-ink">Operational signals.</strong>{" "}
              Device type, IP address, and request timing, used for security,
              rate limiting, and abuse prevention.
            </li>
          </ul>
        </Section>

        <Section number="02" heading="What we do not keep">
          <p>Some data is intentionally outside our reach:</p>
          <ul className="flex flex-col gap-2 pl-5 list-disc marker:text-muted">
            <li>
              <strong className="font-medium text-ink">
                GPS coordinates from your images.
              </strong>{" "}
              Stripped during upload and never written to our storage.
            </li>
            <li>
              <strong className="font-medium text-ink">
                Raw payment instruments.
              </strong>{" "}
              Card numbers and bank credentials are handled by our payment
              provider; Jettison only sees the metadata above.
            </li>
            <li>
              <strong className="font-medium text-ink">
                Browsing telemetry beyond what runs the service.
              </strong>{" "}
              No third-party ad-tracking pixels at MVP.
            </li>
          </ul>
        </Section>

        <Section number="03" heading="Where data lives">
          <p>
            Jettison runs on Supabase — Postgres for the database, Supabase
            Auth for accounts, Supabase Storage for images. Production data
            is hosted in the United States at MVP. Backups are encrypted
            at rest.
          </p>
          <p className="text-secondary text-sm">
            Region selection is a placeholder until production is locked
            down.
          </p>
        </Section>

        <Section number="04" heading="Who can see what">
          <p>
            <strong className="font-medium text-ink">
              Money data is visible only to members of the trip it belongs to,
            </strong>{" "}
            no matter what — this is the hard rule from{" "}
            <span className="font-mono text-xs text-ink">ADR 0002</span>. A
            public trip shares its itinerary, posts, and photos at the
            visibility you set; it never shares the amounts.
          </p>
          <p>
            Public trip posts and photos are visible per the trip&rsquo;s
            visibility setting. Your follower and following lists are
            visible to anyone who can see your profile. Your handle and
            display name are public; your email is not.
          </p>
        </Section>

        <Section number="05" heading="Third parties">
          <p>
            Jettison shares data with a small, named set of vendors that
            help us run the service:
          </p>
          <ul className="flex flex-col gap-2 pl-5 list-disc marker:text-muted">
            <li>
              <strong className="font-medium text-ink">Supabase</strong> —
              database, authentication, storage.
            </li>
            <li>
              <strong className="font-medium text-ink">
                Payment provider (TBD)
              </strong>{" "}
              — handles the actual movement of money. Their privacy notice
              will be linked here once the payments slice ships.
            </li>
            <li>
              <strong className="font-medium text-ink">
                Email provider (TBD)
              </strong>{" "}
              — magic-link sign-in and notification emails.
            </li>
            <li>
              <strong className="font-medium text-ink">
                CSAM scanning vendor (TBD)
              </strong>{" "}
              — automated scanning of every uploaded image before review.
            </li>
          </ul>
          <p>
            The image moderation queue is staffed by Jettison employees and
            contractors under NDA; reviewed images are not shared with any
            third party except as required to fulfill a CSAM report.
          </p>
        </Section>

        <Section number="06" heading="Your rights">
          <p>
            You can export your data and delete your account from{" "}
            <span className="font-mono text-xs text-ink">Settings → Account</span>.
            Deleting your account removes your profile, posts, and follow
            edges; expense rows on shared trips remain in the trip ledger so
            the other members&rsquo; balances stay correct, but they are
            anonymized to your former handle.
          </p>
          <p className="text-secondary text-sm">
            Export and self-serve deletion are placeholder until the
            settings surface ships; in the meantime, write to the privacy
            inbox below.
          </p>
        </Section>

        <Section number="07" heading="Children">
          <p>
            Jettison is for people 18 and older at MVP. We do not knowingly
            collect data from anyone under 18. If you believe a child has
            created an account, write to the privacy inbox below and we
            will remove the account.
          </p>
        </Section>

        <Section number="08" heading="Changes">
          <p>
            When this Privacy Policy changes materially, we will let you
            know in-app and by email at least seven days before the change
            takes effect.
          </p>
        </Section>

        <Section number="09" heading="Contact">
          <p>
            Privacy questions and data requests go to{" "}
            <a
              className="underline decoration-hairline underline-offset-4 hover:text-ink"
              href="mailto:privacy@jettison.app"
            >
              privacy@jettison.app
            </a>
            .
          </p>
          <p className="text-secondary text-sm">
            The privacy@ inbox address is a placeholder until the production
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
