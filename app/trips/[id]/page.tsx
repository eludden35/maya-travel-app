import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  deleteTripAction,
  leaveTripAction,
  removeTripMemberAction,
} from "@/app/_actions/trips-actions";
import { ConfirmAction } from "@/app/trips/_components/confirm-action";
import { InvitePanel, type PanelInvite } from "@/app/trips/_components/invite-panel";
import { requireProfileFor } from "@/lib/profiles";
import { formatTripDates, formatTripLength } from "@/lib/trip-dates";
import {
  formatExpiresIn,
  inviteLifetimeDays,
  inviteLinkState,
} from "@/lib/trip-invite-fields";
import { getNewestTripInvite, inviteUrl, type TripInvite } from "@/lib/trip-invites";
import { getTripById, getTripMembers, type TripVisibility } from "@/lib/trips";
import { isUuid } from "@/lib/uuid";

// The trip name stays out of the title: link previews and shared screens
// shouldn't carry it.
export const metadata: Metadata = {
  title: "Trip · Jettison",
};

const VISIBILITY_LABEL: Record<TripVisibility, string> = {
  private: "Private trip",
  unlisted: "Unlisted trip",
  public: "Public trip",
};

const DESTRUCTIVE_BUTTON =
  "h-12 w-full rounded-md border border-error/40 bg-paper text-error font-medium hover:bg-error/5";

/**
 * A trip's page (Bead tripplanner-718): its details and who's going. Later
 * beads add sections here: invites (tripplanner-2o5.1), posts (2o5.6),
 * costs and balances (2o5.2, 2o5.3, 2o5.5).
 *
 * - Signed out: sign-in first, before anything loads (test plan S2-N2).
 * - Can't see the trip, or it doesn't exist: the same "not found" (S2-N3).
 * - Members see who's going; the list is members-only even on a public
 *   trip. A block between two members doesn't hide names here (§12 Q5).
 * - The organizer edits, removes members and deletes; members leave. The
 *   organizer can't leave (§12 Q4). The RPCs enforce all of this; the page
 *   only decides which controls to offer.
 */
export default async function TripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfileFor(isUuid(id) ? `/trips/${id}` : "/");

  if (!isUuid(id)) {
    notFound();
  }
  const trip = await getTripById(id);
  if (!trip) {
    notFound();
  }

  const members = await getTripMembers(trip.id);
  const isMember = members.some((m) => m.profile_id === profile.id);
  const isOrganizer = trip.organizer_id === profile.id;
  // Only the organizer can read a trip's links (tripplanner-2o5.1).
  const invite = isOrganizer ? await getNewestTripInvite(trip.id) : null;
  const length = formatTripLength(trip.start_date, trip.end_date);

  return (
    <main className="flex flex-1 flex-col items-center px-6 pt-6 pb-12 bg-paper text-ink">
      <div className="w-full max-w-sm flex flex-col gap-8">
        <Link
          href="/"
          className="self-start inline-flex items-center gap-2 min-h-11 font-mono text-xs uppercase tracking-[0.2em] text-secondary hover:text-ink"
        >
          <span aria-hidden="true">←</span> Your trips
        </Link>

        <header className="flex flex-col gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
            {VISIBILITY_LABEL[trip.visibility]} · {trip.currency}
          </p>
          <h1
            className={`font-display leading-tight break-words ${
              trip.name.length > 40 ? "text-3xl" : "text-4xl"
            }`}
          >
            {trip.name}
          </h1>
          <p className="text-secondary">
            <span className="text-ink">
              {formatTripDates(trip.start_date, trip.end_date)}
            </span>
            {length ? <> · {length}</> : null}
          </p>
          {isOrganizer ? (
            <Link
              href={`/trips/${trip.id}/edit`}
              className="self-start inline-flex items-center min-h-11 px-4 rounded-md border border-hairline bg-card text-sm font-medium hover:bg-paper"
            >
              Edit trip
            </Link>
          ) : null}
        </header>

        {isOrganizer ? (
          <InvitePanel
            tripId={trip.id}
            tripName={trip.name}
            invite={invite ? toPanelInvite(invite, new Date()) : null}
          />
        ) : null}

        {trip.description ? (
          <section aria-label="About this trip" className="rounded-2xl bg-card p-5">
            <p className="whitespace-pre-line break-words leading-relaxed text-body">
              {trip.description}
            </p>
          </section>
        ) : null}

        {isMember ? (
          <section aria-labelledby="whos-going" className="flex flex-col gap-3">
            <h2
              id="whos-going"
              className="font-mono text-xs uppercase tracking-[0.2em] text-secondary"
            >
              Who&apos;s going{" "}
              <span className="text-ink tabular-nums">· {members.length}</span>
            </h2>
            {/* Announces the new count after a removal, which takes its row
                (and the dialog that asked) off the page. */}
            <p className="sr-only" aria-live="polite">
              {members.length === 1
                ? "1 person is going."
                : `${members.length} people are going.`}
            </p>
            <ul className="rounded-2xl bg-card divide-y divide-hairline">
              {members.map((member) => (
                <li
                  key={member.profile_id}
                  className="flex items-center gap-3 px-4 py-3 min-h-16"
                >
                  <span
                    aria-hidden="true"
                    className="size-10 shrink-0 rounded-full border border-hairline bg-paper flex items-center justify-center font-display text-lg"
                  >
                    {initialOf(member.display_name)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{member.display_name}</span>
                    <span className="truncate font-mono text-xs text-secondary">
                      @{member.handle}
                      {member.profile_id === profile.id ? " · you" : null}
                    </span>
                  </span>
                  {member.role === "organizer" ? (
                    <span className="shrink-0 font-mono text-xs uppercase tracking-[0.15em] px-2 py-1 rounded bg-ember/10 border border-ember/30 text-ink">
                      Organizer
                    </span>
                  ) : isOrganizer ? (
                    <ConfirmAction
                      action={removeTripMemberAction.bind(null, trip.id, member.profile_id)}
                      trigger="Remove"
                      triggerAriaLabel={`Remove ${member.display_name}`}
                      triggerClassName="shrink-0 h-11 px-3 rounded-md border border-hairline bg-paper text-sm text-secondary hover:text-error"
                      title={`Remove ${member.display_name}?`}
                      body={`${member.display_name} will stop seeing this trip. If they still have the invite link, make a new one so they can't rejoin with it.`}
                      confirmLabel="Remove"
                      pendingLabel="Removing…"
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="text-sm text-secondary">
            Only the people on this trip can see who&apos;s going.
          </p>
        )}

        {isMember ? (
          <section
            aria-label={isOrganizer ? "Delete this trip" : "Leave this trip"}
            className="flex flex-col gap-3 border-t border-hairline pt-6"
          >
            {isOrganizer ? (
              <>
                <ConfirmAction
                  action={deleteTripAction.bind(null, trip.id)}
                  trigger="Delete trip"
                  triggerClassName={DESTRUCTIVE_BUTTON}
                  title={`Delete ${trip.name}?`}
                  body="This removes the trip for everyone in it, along with everything added to it. It can't be undone."
                  confirmLabel="Delete trip"
                  pendingLabel="Deleting…"
                  cancelLabel="Keep trip"
                />
                <p className="text-sm text-secondary">
                  You organize this trip, so you stay in it until it&apos;s
                  deleted.
                </p>
              </>
            ) : (
              <ConfirmAction
                action={leaveTripAction.bind(null, trip.id)}
                trigger="Leave trip"
                triggerClassName={DESTRUCTIVE_BUTTON}
                title={`Leave ${trip.name}?`}
                body="You'll stop seeing this trip. To come back, you'll need a new invite."
                confirmLabel="Leave trip"
                pendingLabel="Leaving…"
                cancelLabel="Stay"
              />
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}

/** What the invite panel needs; the token only goes out while the link is live. */
function toPanelInvite(invite: TripInvite, now: Date): PanelInvite {
  const state = inviteLinkState(invite, now);
  return {
    id: invite.id,
    state,
    url: state === "live" ? inviteUrl(invite.token) : null,
    expiresIn: formatExpiresIn(invite.expires_at, now),
    uses: invite.uses,
    maxUses: invite.max_uses,
    lifetimeDays: inviteLifetimeDays(invite),
  };
}

function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "?";
}
