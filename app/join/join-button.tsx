"use client";

import { useActionState } from "react";

import type { JoinState } from "@/app/_actions/trip-invites-actions";

/**
 * "Join trip" for someone signed in (Bead tripplanner-2o5.1). A POST, never
 * a page load, so nothing joins a trip without a tap. The token comes from
 * the invite cookie on the server, not from this form. When the server
 * refuses (the link expired, filled up or was turned off since the page
 * loaded), its message shows above the button and is announced.
 */
export function JoinButton({
  action,
}: {
  action: (state: JoinState) => Promise<JoinState>;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });

  return (
    <form action={formAction} className="flex flex-col gap-3">
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
        {pending ? "Joining…" : "Join trip"}
      </button>
    </form>
  );
}
