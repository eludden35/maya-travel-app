"use client";

import { useActionState, useId, useRef, useState } from "react";

import {
  createTripInviteAction,
  replaceTripInviteAction,
  revokeTripInviteAction,
  type InviteFormState,
} from "@/app/_actions/trip-invites-actions";
import { ConfirmAction } from "@/app/trips/_components/confirm-action";
import {
  DEFAULT_INVITE_EXPIRY_DAYS,
  DEFAULT_INVITE_MAX_USES,
  INVITE_EXPIRY_CHOICES,
  INVITE_MAX_USES_CHOICES,
  type InviteLinkState,
} from "@/lib/trip-invite-fields";

/** The trip's newest link, as the page saw it. `url` only while it's live. */
export type PanelInvite = {
  id: string;
  state: InviteLinkState;
  url: string | null;
  expiresIn: string;
  uses: number;
  maxUses: number;
  lifetimeDays: number;
};

const SECONDARY_BUTTON =
  "h-12 rounded-md border border-hairline bg-paper text-ink font-medium hover:bg-card";

const LAST_LINK_COPY: Record<Exclude<InviteLinkState, "live">, string> = {
  expired: "Your last link expired.",
  full: "Everyone your last link was for has joined.",
  revoked: "Your last link is turned off.",
};

/**
 * The organizer's invite controls on a trip page (Bead tripplanner-2o5.1).
 *
 * One live link per trip. While it's live: the link, Share (the Web Share
 * API where the browser has it, otherwise a copy), Copy, when it stops
 * working and how many have joined, "New link" (the old one stops working)
 * and "Turn off link". Otherwise a short form for a new one; the defaults are
 * a week and 10 people (test plan §12 Q6).
 *
 * Only the organizer gets this panel, and only the organizer can read the
 * link (RLS), so nobody else's page ever holds the token.
 *
 * `admitsNewAccounts` is false when the organizer's own email isn't on the
 * allow-list (tripplanner-x6a). Their links then let in only people who
 * already have an account (and allow-listed newcomers), and the panel says
 * so in one line.
 */
export function InvitePanel({
  tripId,
  tripName,
  invite,
  admitsNewAccounts,
}: {
  tripId: string;
  tripName: string;
  invite: PanelInvite | null;
  admitsNewAccounts: boolean;
}) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2
        id={headingId}
        className="font-mono text-xs uppercase tracking-[0.2em] text-secondary"
      >
        Invite people
      </h2>
      {admitsNewAccounts ? null : (
        <p className="text-sm text-secondary">
          Your links only work for people who already have an account.
        </p>
      )}
      {invite?.state === "live" && invite.url ? (
        <LiveInvite
          key={invite.id}
          tripId={tripId}
          tripName={tripName}
          invite={{ ...invite, url: invite.url }}
        />
      ) : (
        <CreateInvite
          tripId={tripId}
          lastLink={invite && invite.state !== "live" ? LAST_LINK_COPY[invite.state] : null}
        />
      )}
    </section>
  );
}

function LiveInvite({
  tripId,
  tripName,
  invite,
}: {
  tripId: string;
  tripName: string;
  invite: PanelInvite & { url: string };
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputId = useId();

  async function copy() {
    try {
      await navigator.clipboard.writeText(invite.url);
      setNotice("Link copied. Paste it wherever your group talks.");
    } catch {
      inputRef.current?.select();
      setNotice("Copy the selected link.");
    }
  }

  async function share() {
    if (typeof navigator.share !== "function") {
      await copy();
      return;
    }
    try {
      await navigator.share({
        title: tripName,
        text: `Join ${tripName} on Jettison`,
        url: invite.url,
      });
      setNotice(null);
    } catch (error) {
      // Closing the share sheet isn't a failure.
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        await copy();
      }
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-card p-4">
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-sm text-secondary">
          Invite link
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          readOnly
          value={invite.url}
          onFocus={(event) => event.currentTarget.select()}
          className="h-12 w-full min-w-0 rounded-md border border-hairline bg-paper px-3 font-mono text-sm text-ink focus-visible:outline-2 focus-visible:outline-ember"
        />
        <p className="font-mono text-xs text-secondary tabular-nums">
          Expires {invite.expiresIn} · {invite.uses} of {invite.maxUses} joined
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={share}
            className="h-12 rounded-md bg-ember text-ink font-medium hover:opacity-90"
          >
            Share link
          </button>
          <button type="button" onClick={copy} className={SECONDARY_BUTTON}>
            Copy link
          </button>
        </div>
        {/* Always rendered, so screen readers hear the confirmation. */}
        <p aria-live="polite" className="min-h-5 text-sm text-secondary">
          {notice}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-hairline pt-4">
        <ConfirmAction
          action={replaceTripInviteAction.bind(
            null,
            tripId,
            invite.lifetimeDays,
            invite.maxUses,
          )}
          trigger="New link"
          triggerClassName={`${SECONDARY_BUTTON} text-sm`}
          title="Make a new link?"
          body="This link stops working right away. Anyone who hasn't joined yet will need the new one."
          confirmLabel="Make new link"
          pendingLabel="Making…"
        />
        <ConfirmAction
          action={revokeTripInviteAction.bind(null, tripId, invite.id)}
          trigger="Turn off link"
          triggerClassName={`${SECONDARY_BUTTON} text-sm text-secondary hover:text-error`}
          title="Turn off this link?"
          body="It stops working right away. People who already joined stay in the trip."
          confirmLabel="Turn off link"
          pendingLabel="Turning off…"
        />
      </div>
    </div>
  );
}

function CreateInvite({
  tripId,
  lastLink,
}: {
  tripId: string;
  lastLink: string | null;
}) {
  const [state, formAction, pending] = useActionState<InviteFormState, FormData>(
    createTripInviteAction.bind(null, tripId),
    { error: null },
  );
  const expiryId = useId();
  const usesId = useId();

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-2xl bg-card p-4">
      <p className="text-sm text-secondary">
        {lastLink ? `${lastLink} ` : null}
        Make a link for the people you&apos;re going with. Anyone who has it
        can join until it runs out.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={expiryId} className="text-sm text-secondary">
            Works for
          </label>
          <select
            id={expiryId}
            name="expires_in_days"
            defaultValue={DEFAULT_INVITE_EXPIRY_DAYS}
            disabled={pending}
            className="h-12 w-full rounded-md border border-hairline bg-paper px-3 text-ink focus-visible:outline-2 focus-visible:outline-ember"
          >
            {INVITE_EXPIRY_CHOICES.map((choice) => (
              <option key={choice.days} value={choice.days}>
                {choice.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={usesId} className="text-sm text-secondary">
            Lets in
          </label>
          <select
            id={usesId}
            name="max_uses"
            defaultValue={DEFAULT_INVITE_MAX_USES}
            disabled={pending}
            className="h-12 w-full rounded-md border border-hairline bg-paper px-3 text-ink focus-visible:outline-2 focus-visible:outline-ember"
          >
            {INVITE_MAX_USES_CHOICES.map((uses) => (
              <option key={uses} value={uses}>
                {uses === 1 ? "1 person" : `${uses} people`}
              </option>
            ))}
          </select>
        </div>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-error">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="h-12 rounded-md bg-ember text-ink font-medium hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Making link…" : "Create invite link"}
      </button>
    </form>
  );
}
