"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

const FinishContext = createContext<(announcement: string) => void>(() => {});

/** For a form inside a sheet: closes it and announces what just happened. */
export function useFinishSheet() {
  return useContext(FinishContext);
}

/**
 * The bottom sheet behind Add a cost, Edit and Mark as paid (Bead
 * tripplanner-2o5.5). A native modal <dialog>: showModal() traps focus, Escape
 * closes it and focus returns to the trigger. Its contents mount only while
 * it's open, so a long list of costs doesn't carry a form per row, and every
 * opening starts from the saved values.
 *
 * Tapping outside doesn't close it: a half-entered split is too easy to lose.
 * A form inside calls `useFinishSheet` once it has saved.
 */
export function MoneySheet({
  trigger,
  triggerAriaLabel,
  triggerClassName,
  title,
  children,
}: {
  trigger: string;
  triggerAriaLabel?: string;
  triggerClassName: string;
  title: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [announced, setAnnounced] = useState({ text: "", count: 0 });
  const titleId = useId();

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
    }
  }, [open]);

  const finish = useCallback((text: string) => {
    setAnnounced((current) => ({ text, count: current.count + 1 }));
    dialogRef.current?.close();
  }, []);

  return (
    <>
      <button
        type="button"
        aria-label={triggerAriaLabel}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {/* The trailing no-break space on every other message changes the
          text, so saying the same thing twice is announced twice. */}
      <span className="sr-only" aria-live="polite">
        {announced.text}
        {announced.count % 2 === 0 ? " " : ""}
      </span>
      {open ? (
        <dialog
          ref={dialogRef}
          aria-labelledby={titleId}
          onClose={() => setOpen(false)}
          className="animate-sheet-up m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-2xl bg-paper text-ink backdrop:bg-ink/50 sm:m-auto sm:max-w-sm sm:rounded-2xl"
        >
          <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-hairline bg-paper px-6 py-3">
            <h2 id={titleId} className="font-display text-2xl leading-tight">
              {title}
            </h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="h-11 shrink-0 rounded-md px-3 text-sm text-secondary hover:text-ink"
            >
              Close
            </button>
          </header>
          <FinishContext value={finish}>{children}</FinishContext>
        </dialog>
      ) : null}
    </>
  );
}
