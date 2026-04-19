"use client";

import { useState, useTransition } from "react";

import {
  followAction,
  unfollowAction,
} from "@/app/_actions/follows-actions";

/**
 * Follow / Unfollow toggle (Bead tripplanner-s3a.2).
 *
 * Owns:
 *  - optimistic toggle state (flip immediately on click, revert on error),
 *  - pending state (disable + transient copy via useTransition),
 *  - aria-live status announcements for screen readers.
 *
 * Brand discipline:
 *  - Default state: "Follow @handle" on `bg-ember` (single-accent palette;
 *    same family as the onboarding CTA).
 *  - Following state: "Following" on `bg-card border-hairline`. Hover/focus
 *    flips copy to "Unfollow @handle" so the destructive intent is explicit
 *    only when the user is about to commit it (Instagram pattern).
 *  - Never uses the verb "jettison" — that verb is reserved for marketing
 *    voice per AGENTS.md, and reads as "throw away" in transactional flows.
 *  - Tap target ≥44px (h-11 = 44px) per .cursor/skills/project-ui-ux.
 */
export function FollowButton({
  profileId,
  profileHandle,
  initiallyFollowing,
}: {
  profileId: string;
  profileHandle: string;
  initiallyFollowing: boolean;
}) {
  const [following, setFollowing] = useState(initiallyFollowing);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    if (pending) return;
    setError(null);
    const optimistic = !following;
    setFollowing(optimistic);

    startTransition(async () => {
      const result = optimistic
        ? await followAction(profileId)
        : await unfollowAction(profileId);

      if (result.ok) return;

      // Treat already_following as success — the desired end state is reached.
      if (
        "error" in result &&
        result.error === "already_following" &&
        optimistic
      ) {
        return;
      }

      setFollowing(!optimistic);
      setError(
        result.error === "unauthorized"
          ? "Sign in to follow."
          : result.error === "profile_not_found"
            ? "That profile is gone."
            : result.error === "cannot_self_follow"
              ? "You can’t follow yourself."
              : "Something went wrong. Try again.",
      );
    });
  };

  const baseClasses =
    "inline-flex items-center justify-center h-11 min-w-[7.5rem] px-4 rounded-full text-sm font-medium transition-opacity focus-visible:outline-2 focus-visible:outline-ember disabled:opacity-60";

  // Distinct-by-default treatment per .cursor/skills/project-ui-ux:
  // unfollowed = ember confidence; followed = quiet card chip with hairline.
  const stateClasses = following
    ? "bg-card border border-hairline text-ink hover:bg-paper group"
    : "bg-ember text-ink hover:opacity-90";

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-pressed={following}
        aria-label={
          following
            ? `Following @${profileHandle}. Activate to unfollow.`
            : `Follow @${profileHandle}.`
        }
        className={`${baseClasses} ${stateClasses}`}
      >
        {following ? (
          <>
            <span className="group-hover:hidden group-focus-visible:hidden">
              Following
            </span>
            <span className="hidden group-hover:inline group-focus-visible:inline">
              Unfollow
            </span>
          </>
        ) : (
          <span>Follow</span>
        )}
      </button>
      <span aria-live="polite" className="sr-only">
        {pending
          ? "Saving"
          : following
            ? `Following @${profileHandle}`
            : `Not following @${profileHandle}`}
      </span>
      {error ? (
        <span role="alert" className="text-xs text-error">
          {error}
        </span>
      ) : null}
    </span>
  );
}
