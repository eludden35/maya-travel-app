import Link from "next/link";

import { FollowButton } from "@/app/_components/follow-button";
import { getFollowCounts } from "@/lib/follows";
import {
  listDiscoverableProfilesExcluding,
  requireProfile,
} from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";

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

  const [counts, discoverable] = await Promise.all([
    getFollowCounts(profile.id),
    listDiscoverableProfilesExcluding(profile.id, 10),
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
                  <FollowButton
                    profileId={p.id}
                    profileHandle={p.handle}
                    initiallyFollowing={p.isFollowing}
                  />
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
