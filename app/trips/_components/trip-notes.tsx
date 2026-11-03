import Link from "next/link";

import {
  createTripPostAction,
  deleteTripPostAction,
  reportTripPostAction,
} from "@/app/_actions/trip-posts-actions";
import { PostTime } from "@/app/_components/post-time";
import { ConfirmAction } from "@/app/trips/_components/confirm-action";
import { NoteComposer } from "@/app/trips/_components/note-composer";
import { ReportNote } from "@/app/trips/_components/report-note";
import { DataAccessError } from "@/lib/errors";
import { getTripPosts, type TripPost, type TripPostsPage } from "@/lib/trip-posts";

const HEADING =
  "font-mono text-xs uppercase tracking-[0.2em] text-secondary";

/**
 * "Trip notes": text posts inside a trip, for its members only (Bead
 * tripplanner-2o5.6; test plan S6). The trip page renders this for members,
 * behind Suspense, between who's going and leave/delete.
 *
 * Newest first, 50 at a time. Each note is signed with its author's name,
 * even across a block (founder decision Q5). Its author can delete it; anyone
 * else can report it. A note taken down after a report stays visible to its
 * author alone, marked. Text renders as text, so markup in a note never runs
 * (S6 step 4).
 */
export async function TripNotes({
  tripId,
  before,
}: {
  tripId: string;
  before: string | null;
}) {
  let page: TripPostsPage | null = null;
  try {
    page = await getTripPosts(tripId, before ?? undefined);
  } catch (error) {
    // The notes fail on their own; the rest of the trip page still works.
    if (!(error instanceof DataAccessError)) {
      throw error;
    }
    console.error(error);
  }
  const oldest = page?.posts.at(-1);

  return (
    <section id="notes" aria-labelledby="trip-notes" className="flex flex-col gap-4 scroll-mt-6">
      <h2 id="trip-notes" className={HEADING}>
        Trip notes
      </h2>
      <NoteComposer action={createTripPostAction.bind(null, tripId)} />

      {page === null ? (
        <p className="rounded-2xl border border-hairline bg-card p-5 text-sm text-secondary">
          The notes didn&apos;t load just now. Refresh the page to try again.
        </p>
      ) : page.posts.length === 0 ? (
        before ? (
          <p className="text-sm text-secondary">There are no older notes.</p>
        ) : (
          <div className="flex flex-col gap-1 rounded-2xl border border-dashed border-hairline p-5 text-center">
            <p className="font-display text-xl">No notes yet.</p>
            <p className="text-sm text-secondary">
              Pin the first one: flight times, where you&apos;re staying, the
              plan for Saturday.
            </p>
          </div>
        )
      ) : (
        <ol className="flex flex-col gap-4">
          {page.posts.map((post) => (
            <li key={post.id}>
              <NoteCard post={post} tripId={tripId} />
            </li>
          ))}
        </ol>
      )}

      {page?.hasOlder && oldest ? (
        <Link
          href={`/trips/${tripId}?before=${oldest.id}#notes`}
          className="self-center inline-flex items-center min-h-11 px-4 rounded-md border border-hairline bg-card text-sm font-medium hover:bg-paper"
        >
          Show older notes
        </Link>
      ) : null}
      {before ? (
        <Link
          href={`/trips/${tripId}#notes`}
          className="self-center inline-flex items-center min-h-11 px-4 text-sm text-secondary underline underline-offset-4 hover:text-ink"
        >
          Back to the newest notes
        </Link>
      ) : null}
    </section>
  );
}

/** What the trip page shows while the notes load. */
export function TripNotesSkeleton() {
  return (
    <section aria-labelledby="trip-notes-loading" className="flex flex-col gap-4">
      <h2 id="trip-notes-loading" className={HEADING}>
        Trip notes
      </h2>
      <p className="sr-only" role="status">
        Loading notes…
      </p>
      <div aria-hidden="true" className="h-40 rounded-2xl border border-hairline bg-paper animate-pulse" />
      <div aria-hidden="true" className="h-28 rounded-2xl bg-card animate-pulse" />
    </section>
  );
}

function NoteCard({ post, tripId }: { post: TripPost; tripId: string }) {
  return (
    <article
      aria-label={`Note from ${post.author_display_name}`}
      className={`flex flex-col gap-4 rounded-2xl border border-dashed p-5 ${
        post.taken_down ? "border-error/40 bg-paper" : "border-hairline bg-card"
      }`}
    >
      {post.taken_down ? (
        <div className="flex flex-col gap-1">
          <p className="self-start font-mono text-xs uppercase tracking-[0.15em] px-2 py-1 rounded border border-error/40 text-error">
            Taken down
          </p>
          <p className="text-sm text-secondary">
            Removed after a report, so only you can see it now.
          </p>
        </div>
      ) : null}

      <p className="whitespace-pre-line wrap-anywhere leading-relaxed text-body">
        {post.body}
      </p>

      <footer className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="font-display italic text-lg leading-tight wrap-anywhere">
            <span aria-hidden="true">— </span>
            {post.author_display_name}
          </span>
          <span className="font-mono text-xs text-secondary wrap-anywhere">
            @{post.author_handle}
            {post.is_own ? " · you" : null} · <PostTime createdAt={post.created_at} />
          </span>
        </div>
        {post.is_own ? (
          <ConfirmAction
            action={deleteTripPostAction.bind(null, tripId, post.id)}
            trigger="Delete"
            triggerAriaLabel="Delete your note"
            triggerClassName="shrink-0 h-11 px-3 rounded-md text-sm text-secondary hover:text-error hover:bg-paper"
            title="Delete this note?"
            body="It disappears for everyone in the trip. This can't be undone."
            confirmLabel="Delete note"
            pendingLabel="Deleting…"
            cancelLabel="Keep it"
          />
        ) : (
          <ReportNote
            action={reportTripPostAction.bind(null, tripId, post.id)}
            authorName={post.author_display_name}
            reported={post.reported_by_me}
          />
        )}
      </footer>
    </article>
  );
}
