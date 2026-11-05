import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { acceptTripInviteAction } from "@/app/_actions/trip-invites-actions";
import { readInviteToken } from "@/lib/auth-flow";
import { getCurrentProfile } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";
import { formatTripDates, formatTripLength } from "@/lib/trip-dates";
import { getTripInvitePreview } from "@/lib/trip-invites";

import { JoinButton } from "./join-button";

// Chat apps build link previews from these, so nothing here names the trip
// (test plan PV5).
export const metadata: Metadata = {
  title: "You're invited · Jettison",
  description: "Open the invite to see the trip and join it.",
};

/**
 * An invitation (Bead tripplanner-2o5.1). People arrive from /join/<token>,
 * which put the token in a cookie, so this URL never carries it.
 *
 * - A link that isn't working gets one answer, whatever the reason: unknown,
 *   expired, turned off, full, or a block between the viewer and someone in
 *   the trip (test plan S3-N1, §12 Q9).
 * - Someone already in the trip goes straight to it.
 * - Otherwise the trip's name and dates, the organizer's display name and
 *   the member count, and nothing else: no members, posts or amounts.
 * - Signed out: "Join trip" goes to sign-in, which comes back here.
 *   Signed in without a profile: onboarding, which joins in the same step.
 *   Signed in: "Join trip" accepts and lands on the trip.
 */
export default async function JoinPage() {
  const token = await readInviteToken();
  const preview = token ? await getTripInvitePreview(token) : null;
  if (!preview) {
    return <InviteNotWorking />;
  }
  if (preview.tripId) {
    redirect(`/trips/${preview.tripId}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && !(await getCurrentProfile())) {
    redirect("/onboarding/handle");
  }

  const length = formatTripLength(preview.startDate, preview.endDate);
  const going = preview.memberCount;

  return (
    <main className="flex flex-1 flex-col items-center px-6 pt-10 bg-paper text-ink">
      <div className="w-full max-w-sm flex flex-1 flex-col gap-8">
        <header className="flex flex-col gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
            You&apos;re invited
          </p>
          <h1
            className={`font-display leading-tight break-words ${
              preview.tripName.length > 40 ? "text-3xl" : "text-4xl"
            }`}
          >
            {preview.tripName}
          </h1>
          <p className="text-secondary">
            <span className="text-ink">
              {formatTripDates(preview.startDate, preview.endDate)}
            </span>
            {length ? <> · {length}</> : null}
          </p>
        </header>

        <section
          aria-label="Who's asking"
          className="flex flex-col gap-4 rounded-2xl bg-card p-5"
        >
          <p className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="size-10 shrink-0 rounded-full border border-hairline bg-paper flex items-center justify-center font-display text-lg"
            >
              {initialOf(preview.organizerDisplayName)}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm text-secondary">Organized by</span>
              <span className="font-medium break-words">
                {preview.organizerDisplayName}
              </span>
            </span>
          </p>
          <p className="border-t border-hairline pt-4 text-secondary">
            <span className="font-display text-3xl leading-none tabular-nums text-ink">
              {going}
            </span>{" "}
            {going === 1 ? "person is" : "people are"} going so far.
          </p>
        </section>

        <p className="text-sm text-secondary">
          Join to see who&apos;s going and keep the trip&apos;s shared costs
          straight with them.
        </p>

        <div className="sticky bottom-0 mt-auto -mx-6 flex flex-col gap-3 border-t border-hairline bg-paper/95 px-6 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur-sm">
          {user ? (
            <JoinButton action={acceptTripInviteAction} />
          ) : (
            <Link
              href="/auth/sign-in?next=%2Fjoin"
              className="h-12 rounded-md bg-ember text-ink font-medium flex items-center justify-center hover:opacity-90"
            >
              Join trip
            </Link>
          )}
          <Link
            href="/"
            className="min-h-11 inline-flex items-center justify-center text-sm text-secondary underline-offset-4 hover:underline"
          >
            Not now
          </Link>
        </div>
      </div>
    </main>
  );
}

/** One answer for every link that isn't working, so none of them says why. */
function InviteNotWorking() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 bg-paper text-ink">
      <div className="w-full max-w-sm flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
            Jettison
          </p>
          <h1 className="font-display text-3xl leading-tight">
            This invite no longer works.
          </h1>
          <p className="text-secondary text-sm">
            Invite links stop working when they expire, fill up or get turned
            off. Ask whoever sent it for a new one.
          </p>
        </header>
        <Link
          href="/"
          className="h-12 rounded-md border border-hairline bg-card text-ink font-medium flex items-center justify-center hover:bg-paper"
        >
          Go to Jettison
        </Link>
      </div>
    </main>
  );
}

function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "?";
}
