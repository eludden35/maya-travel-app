import Link from "next/link";

import { BlockLink } from "@/app/_components/block-link";
import { FollowButton } from "@/app/_components/follow-button";
import { getBlockedProfileIds } from "@/lib/blocks";
import { getFollowCounts } from "@/lib/follows";
import {
  listDiscoverableProfilesExcluding,
  requireProfile,
} from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";
import {
  listTripsForViewer,
  type TripVisibility,
  type TripWithMemberCount,
} from "@/lib/trips";

/**
 * Home / signed-in landing.
 *
 * Anonymous: marketing-flavored welcome with a sign-in CTA.
 *
 * Signed-in: greeting, follower / following counts, and a "People to follow"
 * section listing up to 10 other discoverable profiles with a FollowButton
 * each (Bead tripplanner-s3a.2). This is the smallest end-to-end slice that
 * exercises the follow graph from the UI layer.
 *
 * The big "$0" numeral stays as a scaffold smoke-test for the Fraunces type
 * pairing and the Tailwind tokens; it is not a product surface yet.
 *
 * Onboarding gate: signed-in users without a Profile row are redirected to
 * `/onboarding/handle` by `requireProfile()`.
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <AnonymousWelcome />;
  }

  const profile = await requireProfile();

  // Fetch the caller's blocked-id set first; the discover query uses it to
  // filter out blocked profiles. Two round-trips, but the home page is
  // signed-in only and the blocked set is small (Bead tripplanner-s3a.16).
  const blockedIds = await getBlockedProfileIds(profile.id);

  const [counts, discoverable, trips] = await Promise.all([
    getFollowCounts(profile.id),
    listDiscoverableProfilesExcluding(profile.id, 10, {
      excludeIds: blockedIds,
    }),
    listTripsForViewer(profile.id, { limit: 5 }),
  ]);

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-12 bg-paper text-ink">
      <div className="w-full max-w-sm flex flex-col gap-10">
        <header className="flex flex-col gap-2 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
            Jettison
          </p>
          <h1 className="font-display text-4xl leading-tight">
            Hello, {profile.display_name}
          </h1>
          <p className="text-secondary">
            Signed in as @{profile.handle}.
          </p>
          <p className="font-mono text-sm text-secondary tabular-nums mt-1">
            <span className="text-ink">{counts.followers}</span>{" "}
            follower{counts.followers === 1 ? "" : "s"}
            {" \u00b7 "}
            <span className="text-ink">{counts.following}</span> following
          </p>
        </header>

        <section
          aria-labelledby="your-trips"
          className="flex flex-col gap-4"
        >
          <h2
            id="your-trips"
            className="font-mono text-xs uppercase tracking-[0.2em] text-secondary"
          >
            Your trips
          </h2>

          {trips.length === 0 ? (
            <p className="text-sm text-secondary text-center py-6">
              No trips yet — trip creation is on the way. When it lands, your
              trips will appear here.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {trips.map((t) => (
                <li
                  key={t.id}
                  className="flex items-start gap-3 min-h-[44px] rounded-md border border-hairline bg-card p-3"
                >
                  <div className="flex flex-col min-w-0 flex-1 gap-1">
                    <span className="font-display text-base leading-tight truncate">
                      {t.name}
                    </span>
                    <span className="text-sm text-secondary">
                      {formatTripDates(t.start_date, t.end_date)}
                    </span>
                    <span className="font-mono text-xs text-secondary tabular-nums">
                      {t.memberCount}{" "}
                      {t.memberCount === 1 ? "member" : "members"}
                    </span>
                  </div>
                  <VisibilityChip visibility={t.visibility} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="people-to-follow"
          className="flex flex-col gap-4"
        >
          <h2
            id="people-to-follow"
            className="font-mono text-xs uppercase tracking-[0.2em] text-secondary"
          >
            People to follow
          </h2>

          {discoverable.length === 0 ? (
            <p className="text-sm text-secondary text-center py-6">
              No one else is here yet — share Jettison with a friend who plans
              trips.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {discoverable.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-md border border-hairline bg-card p-3"
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-display text-base leading-tight truncate">
                      {p.display_name}
                    </span>
                    <span className="font-mono text-xs text-secondary truncate">
                      @{p.handle}
                    </span>
                    {p.bio ? (
                      <span className="text-sm text-secondary line-clamp-2 mt-1">
                        {p.bio}
                      </span>
                    ) : null}
                  </div>
                  <span className="flex flex-col items-end gap-2">
                    <FollowButton
                      profileId={p.id}
                      profileHandle={p.handle}
                      initiallyFollowing={p.isFollowing}
                    />
                    <BlockLink
                      profileId={p.id}
                      profileHandle={p.handle}
                      initiallyBlocked={false}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Signature motif: oversized money numerals. Scaffold smoke-test. */}
        <section
          aria-label="Sample balance"
          className="flex flex-col items-center gap-1"
        >
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
            You owe
          </p>
          <p className="font-display text-7xl leading-none tabular-nums text-ink">
            $0
          </p>
          <p className="text-sm text-secondary">
            across <span className="font-mono">0</span> trips
          </p>
        </section>

        <form action="/auth/sign-out" method="post" className="w-full">
          <button
            type="submit"
            className="w-full h-12 rounded-md bg-ink text-paper font-medium hover:opacity-90"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}

// Visibility chip uses existing color tokens only — no new tokens. Each pill
// carries its own visible label so meaning never depends on color alone.
const VISIBILITY_CHIP: Record<
  TripVisibility,
  { label: string; className: string }
> = {
  private: {
    label: "Private",
    className: "bg-paper border border-hairline text-secondary",
  },
  unlisted: {
    label: "Unlisted",
    className: "bg-card border border-hairline text-ink",
  },
  public: {
    label: "Public",
    className: "bg-ember/10 border border-ember/30 text-ink",
  },
};

function VisibilityChip({ visibility }: { visibility: TripVisibility }) {
  const chip = VISIBILITY_CHIP[visibility];
  return (
    <span
      className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] px-2 py-1 rounded ${chip.className}`}
    >
      {chip.label}
    </span>
  );
}

const TRIP_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatTripDates(
  startDate: TripWithMemberCount["start_date"],
  endDate: TripWithMemberCount["end_date"],
): string {
  if (!startDate && !endDate) {
    return "Dates TBD";
  }
  if (startDate && endDate) {
    return `${TRIP_DATE_FORMATTER.format(new Date(startDate))} \u2013 ${TRIP_DATE_FORMATTER.format(new Date(endDate))}`;
  }
  if (startDate) {
    return `From ${TRIP_DATE_FORMATTER.format(new Date(startDate))}`;
  }
  return `Until ${TRIP_DATE_FORMATTER.format(new Date(endDate as string))}`;
}

function AnonymousWelcome() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 bg-paper text-ink">
      <div className="w-full max-w-sm flex flex-col items-center gap-10 text-center">
        <header className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
            Jettison
          </p>
          <h1 className="font-display text-4xl leading-tight">Welcome</h1>
          <p className="text-secondary">
            Sign in to see your trips and balances.
          </p>
        </header>

        <section
          aria-label="Sample balance"
          className="flex flex-col items-center gap-1"
        >
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
            You owe
          </p>
          <p className="font-display text-7xl leading-none tabular-nums text-ink">
            $0
          </p>
          <p className="text-sm text-secondary">
            across <span className="font-mono">0</span> trips
          </p>
        </section>

        <Link
          href="/auth/sign-in"
          className="w-full h-12 rounded-md bg-ember text-ink font-medium flex items-center justify-center hover:opacity-90"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
