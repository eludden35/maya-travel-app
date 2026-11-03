"use client";

import { useActionState, useId, useRef, useState } from "react";

import type { ReportFormState } from "@/app/_actions/trip-posts-actions";
import { REPORT_NOTE_MAX, REPORT_REASONS } from "@/lib/post-fields";

/**
 * Report someone's note to the moderators (Bead tripplanner-2o5.6; test plan
 * S6 step 2).
 *
 * A native modal <dialog>, like ConfirmAction: showModal() traps focus,
 * Escape closes it, focus returns to the trigger, and Cancel comes first.
 * Once the report is sent the dialog thanks the reporter, and the trigger
 * becomes "Reported". This component stays mounted through the refresh that
 * follows, so the thank-you stays on screen. The fields are controlled, so a
 * refusal (the rate limit, say) keeps the chosen reason and note.
 */
export function ReportNote({
  action,
  authorName,
  reported,
}: {
  action: (state: ReportFormState, formData: FormData) => Promise<ReportFormState>;
  authorName: string;
  reported: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    reported: false,
  });
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const id = useId();
  const close = () => dialogRef.current?.close();

  return (
    <>
      {reported ? (
        <span className="shrink-0 inline-flex items-center min-h-11 px-3 text-sm text-secondary">
          Reported
        </span>
      ) : (
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={`Report ${authorName}'s note`}
          onClick={() => dialogRef.current?.showModal()}
          className="shrink-0 h-11 px-3 rounded-md text-sm text-secondary hover:text-ink hover:bg-paper"
        >
          Report
        </button>
      )}
      <dialog
        ref={dialogRef}
        aria-labelledby={`${id}-title`}
        className="m-auto w-[min(calc(100%-2rem),24rem)] max-h-[calc(100dvh-2rem)] rounded-2xl border border-hairline bg-paper text-ink backdrop:bg-ink/50"
      >
        {state.reported ? (
          <div className="flex flex-col gap-4 p-6">
            <h2 id={`${id}-title`} className="font-display text-2xl leading-tight">
              Thanks for telling us.
            </h2>
            <p role="status" className="text-sm text-secondary leading-relaxed">
              {`The Jettison team will take a look. ${authorName} won't be told who reported it.`}
            </p>
            <button
              type="button"
              autoFocus
              onClick={close}
              className="h-12 rounded-md bg-ember text-ink font-medium hover:opacity-90"
            >
              Done
            </button>
          </div>
        ) : (
          <form action={formAction} className="flex flex-col gap-4 p-6">
            <h2 id={`${id}-title`} className="font-display text-2xl leading-tight">
              Report this note?
            </h2>
            <p className="text-sm text-secondary leading-relaxed">
              {`Only the Jettison team sees reports. ${authorName} won't be told who reported it.`}
            </p>
            <fieldset className="flex flex-col gap-2 m-0 p-0 border-0 min-w-0">
              <legend className="text-sm text-secondary mb-2">What&apos;s wrong?</legend>
              {REPORT_REASONS.map((option) => (
                <label
                  key={option.code}
                  className="flex items-center gap-3 min-h-11 px-3 rounded-md border border-hairline bg-card has-[:checked]:border-ember has-[:checked]:bg-ember/5"
                >
                  <input
                    type="radio"
                    name="reason"
                    value={option.code}
                    required
                    checked={reason === option.code}
                    onChange={() => setReason(option.code)}
                    className="size-4 shrink-0 accent-ember"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-note`} className="text-sm text-secondary">
                Anything to add? <span className="text-xs">(optional)</span>
              </label>
              <textarea
                id={`${id}-note`}
                name="note"
                rows={2}
                maxLength={REPORT_NOTE_MAX}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="rounded-md border border-hairline bg-card p-3 text-ink focus-visible:outline-2 focus-visible:outline-ember"
              />
            </div>
            {state.error ? (
              <p role="alert" className="text-sm text-error">
                {state.error}
              </p>
            ) : null}
            <div className="flex flex-col gap-3 pt-2">
              <button
                type="button"
                onClick={close}
                className="h-12 rounded-md border border-hairline bg-card text-ink font-medium hover:bg-paper"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="h-12 rounded-md bg-ink text-paper font-medium hover:opacity-90 disabled:opacity-60"
              >
                {pending ? "Sending…" : "Send report"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
