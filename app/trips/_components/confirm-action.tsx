"use client";

import { useActionState, useId, useRef } from "react";

import type { ConfirmState } from "@/app/_actions/trips-actions";

/**
 * A trip action that needs a second "yes": delete, leave, remove a member
 * (Bead tripplanner-718).
 *
 * Uses a native modal <dialog>: showModal() traps focus, Escape closes it,
 * and focus returns to the trigger. Cancel comes first, so it takes the
 * initial focus and a stray Enter does nothing destructive. When the server
 * refuses (for example, the trip changed in the meantime), its message shows
 * inside the dialog and is announced.
 */
export function ConfirmAction({
  action,
  trigger,
  triggerAriaLabel,
  triggerClassName,
  title,
  body,
  confirmLabel,
  pendingLabel,
  cancelLabel = "Cancel",
}: {
  action: (state: ConfirmState) => Promise<ConfirmState>;
  trigger: string;
  triggerAriaLabel?: string;
  triggerClassName: string;
  title: string;
  body: string;
  confirmLabel: string;
  pendingLabel: string;
  cancelLabel?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(action, { error: null });
  const titleId = useId();
  const bodyId = useId();

  return (
    <>
      <button
        type="button"
        aria-label={triggerAriaLabel}
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
        className={triggerClassName}
      >
        {trigger}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="m-auto w-[min(calc(100%-2rem),24rem)] rounded-2xl border border-hairline bg-paper text-ink backdrop:bg-ink/50"
      >
        <form action={formAction} className="flex flex-col gap-4 p-6">
          <h2 id={titleId} className="font-display text-2xl leading-tight break-words">
            {title}
          </h2>
          <p id={bodyId} className="text-sm text-secondary leading-relaxed">
            {body}
          </p>
          {state.error ? (
            <p role="alert" className="text-sm text-error">
              {state.error}
            </p>
          ) : null}
          {/* A balance refused this: send them to where it gets settled. The
              link is outside the modal's reach until the dialog closes. */}
          {state.error && state.settle ? (
            <a
              href="#settle-up"
              onClick={() => dialogRef.current?.close()}
              className="flex h-12 items-center justify-center rounded-md bg-ink font-medium text-paper hover:opacity-90"
            >
              Go to Settle up
            </a>
          ) : null}
          <div className="flex flex-col gap-3 pt-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="h-12 rounded-md border border-hairline bg-card text-ink font-medium hover:bg-paper"
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              disabled={pending}
              className="h-12 rounded-md bg-error text-paper font-medium hover:opacity-90 disabled:opacity-60"
            >
              {pending ? pendingLabel : confirmLabel}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
