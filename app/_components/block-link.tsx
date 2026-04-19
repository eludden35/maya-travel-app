"use client";

import { useState, useTransition } from "react";

import { blockAction, unblockAction } from "@/app/_actions/blocks-actions";

/**
 * Tiny "Block" / "Blocked · Unblock" text-link affordance under each
 * discover card (Bead tripplanner-s3a.16).
 *
 * Brand discipline:
 *  - This is intentionally NOT a CTA. `text-xs text-secondary
 *    hover:text-error` keeps it quiet so it sits well below the Follow
 *    pill in the card's visual hierarchy.
 *  - Block is destructive — confirm with `window.confirm` at MVP. A
 *    distinct-by-default modal lands when block lives on a profile page
 *    (deferred to tripplanner-s3a.23).
 *  - Unblock does not need a confirm — undoing a block is non-destructive.
 *  - Tap target: this is text-link substrate, not a primary tap target.
 *    The Follow pill above it is the ≥44px tap target on this card.
 *  - Never uses the verb "jettison" — that verb is reserved for marketing
 *    voice per AGENTS.md; reads as "throw away" in transactional flows.
 *  - Microcopy is honest about the symmetric-invisibility consequences so
 *    the user can give informed consent before clicking through.
 */
export function BlockLink({
  profileId,
  profileHandle,
  initiallyBlocked,
}: {
  profileId: string;
  profileHandle: string;
  initiallyBlocked: boolean;
}) {
  const [blocked, setBlocked] = useState(initiallyBlocked);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onBlock = () => {
    if (pending) return;
    const confirmed = window.confirm(
      `Block @${profileHandle}? They won't see you, you won't see them, and any follow between you will be removed.`,
    );
    if (!confirmed) return;

    setError(null);
    setBlocked(true);

    startTransition(async () => {
      const result = await blockAction(profileId);
      if (result.ok) return;

      // Treat already_blocking as success — the desired end state is reached.
      if ("error" in result && result.error === "already_blocking") {
        return;
      }

      setBlocked(false);
      setError(
        result.error === "unauthorized"
          ? "Sign in to block."
          : result.error === "profile_not_found"
            ? "That profile is gone."
            : result.error === "cannot_self_block"
              ? "You can’t block yourself."
              : "Something went wrong. Try again.",
      );
    });
  };

  const onUnblock = () => {
    if (pending) return;
    setError(null);
    setBlocked(false);

    startTransition(async () => {
      const result = await unblockAction(profileId);
      if (result.ok) return;
      setBlocked(true);
      setError(
        result.error === "unauthorized"
          ? "Sign in to unblock."
          : "Something went wrong. Try again.",
      );
    });
  };

  return (
    <span className="flex flex-col items-end gap-1">
      {blocked ? (
        <span className="flex items-center gap-2 text-xs text-secondary">
          <span aria-hidden="true">Blocked</span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={onUnblock}
            disabled={pending}
            aria-label={`Unblock @${profileHandle}.`}
            className="underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-ember disabled:opacity-60"
          >
            Unblock
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={onBlock}
          disabled={pending}
          aria-label={`Block @${profileHandle}.`}
          className="text-xs text-secondary underline underline-offset-2 hover:text-error focus-visible:outline-2 focus-visible:outline-ember disabled:opacity-60"
        >
          Block
        </button>
      )}
      <span aria-live="polite" className="sr-only">
        {pending
          ? "Saving"
          : blocked
            ? `Blocked @${profileHandle}`
            : `Not blocking @${profileHandle}`}
      </span>
      {error ? (
        <span role="alert" className="text-xs text-error">
          {error}
        </span>
      ) : null}
    </span>
  );
}
