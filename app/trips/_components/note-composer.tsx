"use client";

import { useActionState, useId, useState } from "react";

import type { NoteFormState } from "@/app/_actions/trip-posts-actions";
import { POST_BODY_MAX } from "@/lib/post-fields";

/**
 * "Write a trip note" (Bead tripplanner-2o5.6). Text only: there's no photo
 * control in UAT-1 (test plan S6-N2).
 *
 * The textarea is controlled, so React's reset after a form action can't
 * wipe a note the server refused, such as one past the rate limit. Once a
 * note is pinned the fields remount empty: the action counts successes in
 * `posted`, which keys them. The database decides what's valid; the
 * character limit here only mirrors it.
 */
export function NoteComposer({
  action,
}: {
  action: (state: NoteFormState, formData: FormData) => Promise<NoteFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    posted: 0,
  });

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-2xl border border-hairline bg-paper p-4"
    >
      <ComposerFields key={state.posted} error={state.error} pending={pending} />
      {/* The trailing no-break space on every other note changes the text,
          so a screen reader announces each new note, not just the first. */}
      <p className="sr-only" aria-live="polite">
        {state.posted > 0 && !state.error
          ? `Pinned to the trip.${state.posted % 2 === 0 ? " " : ""}`
          : ""}
      </p>
    </form>
  );
}

function ComposerFields({
  error,
  pending,
}: {
  error: string | null;
  pending: boolean;
}) {
  const [body, setBody] = useState("");
  const id = useId();

  return (
    <>
      <label htmlFor={`${id}-body`} className="font-display text-xl leading-tight">
        Write a trip note
      </label>
      <textarea
        id={`${id}-body`}
        name="body"
        rows={3}
        maxLength={POST_BODY_MAX}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Flight times, where you're staying, the plan for Saturday…"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error ${id}-count` : `${id}-count`}
        className="min-h-24 resize-y rounded-md border border-hairline bg-card p-3 text-ink leading-relaxed placeholder:text-secondary/80 focus-visible:outline-2 focus-visible:outline-ember"
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <span id={`${id}-count`} className="font-mono text-xs text-secondary tabular-nums">
          {body.length.toLocaleString("en-US")} / {POST_BODY_MAX.toLocaleString("en-US")}
          <span className="sr-only"> characters</span>
        </span>
        <button
          type="submit"
          disabled={pending}
          className="h-11 px-5 rounded-md bg-ember text-ink font-medium hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Pinning…" : "Pin to trip"}
        </button>
      </div>
    </>
  );
}
