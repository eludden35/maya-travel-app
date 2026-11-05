"use client";

import { useActionState, useId, useState } from "react";

import type { DecisionState } from "@/app/_actions/reports-actions";
import { DECISION_NOTE_MAX } from "@/lib/post-fields";

/**
 * A moderator's decision on one open report (Bead tripplanner-2o5.6): a note
 * for the record, then Take down or Dismiss. The pressed button names the
 * decision. Taking a note down hides it from everyone but its author and
 * closes every open report on it; dismissing leaves it up. When the note is
 * already gone, "Take down" becomes "Mark resolved".
 */
export function ReportDecision({
  action,
  subject,
  noteIsUp,
}: {
  action: (state: DecisionState, formData: FormData) => Promise<DecisionState>;
  /** Names the note in button labels, e.g. "Bob's note". */
  subject: string;
  noteIsUp: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [note, setNote] = useState("");
  const id = useId();

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-note`} className="text-sm text-secondary">
          Note for the record <span className="text-xs">(optional)</span>
        </label>
        <textarea
          id={`${id}-note`}
          name="note"
          rows={2}
          maxLength={DECISION_NOTE_MAX}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="rounded-md border border-hairline bg-paper p-3 text-ink focus-visible:outline-2 focus-visible:outline-ember"
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-error">
          {state.error}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="submit"
          name="decision"
          value="dismiss"
          disabled={pending}
          aria-label={`Dismiss the report on ${subject}`}
          className="h-12 rounded-md border border-hairline bg-paper text-ink font-medium hover:bg-card disabled:opacity-60"
        >
          Dismiss
        </button>
        <button
          type="submit"
          name="decision"
          value="resolve"
          disabled={pending}
          aria-label={noteIsUp ? `Take down ${subject}` : `Mark the report on ${subject} resolved`}
          className="h-12 rounded-md bg-error text-paper font-medium hover:opacity-90 disabled:opacity-60"
        >
          {noteIsUp ? "Take down" : "Mark resolved"}
        </button>
      </div>
    </form>
  );
}
