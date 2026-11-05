import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { decideReportAction } from "@/app/_actions/reports-actions";
import { PostTime } from "@/app/_components/post-time";
import { ReportDecision } from "@/app/admin/reports/_components/report-decision";
import { reportReasonLabel } from "@/lib/post-fields";
import { requireProfileFor } from "@/lib/profiles";
import { listDecidedReports, listOpenReports, type ReportRow } from "@/lib/reports";

export const metadata: Metadata = {
  title: "Reports · Jettison",
};

const HEADING =
  "font-mono text-xs uppercase tracking-[0.2em] text-secondary";

const NOTE_STATE: Record<string, string> = {
  up: "Still up",
  taken_down: "Taken down",
  deleted: "Deleted by its author",
};

/**
 * Reports from trip members, for moderators only (Bead tripplanner-2o5.6;
 * test plan S6 step 3). At UAT-1 the founder is the only moderator.
 *
 * - Signed out: sign-in first. Signed in but not a moderator: "not found",
 *   the same page as for any address that doesn't exist (S6-N3). The
 *   database checks again: `list_reports` gives a non-moderator no rows and
 *   `decide_report` refuses them.
 * - Open reports come oldest first, each with the reported note as it was
 *   when reported (a copy, kept even if the note or trip is deleted), its
 *   trip, its author and the reporter. Never an amount or balance (S6-N4).
 * - Below them, the latest decisions: outcome, who and when.
 */
export default async function ReportsPage() {
  const profile = await requireProfileFor("/admin/reports");
  if (!profile.is_moderator) {
    notFound();
  }

  const [open, decided] = await Promise.all([
    listOpenReports(),
    listDecidedReports(),
  ]);

  return (
    <main className="flex flex-1 flex-col items-center px-6 pt-6 pb-12 bg-paper text-ink">
      <div className="w-full max-w-xl flex flex-col gap-8">
        <Link
          href="/"
          className="self-start inline-flex items-center gap-2 min-h-11 font-mono text-xs uppercase tracking-[0.2em] text-secondary hover:text-ink"
        >
          <span aria-hidden="true">←</span> Home
        </Link>

        <header className="flex flex-col gap-2">
          <p className={HEADING}>Moderation</p>
          <h1 className="font-display text-4xl leading-tight">Reports</h1>
          <p className="text-secondary" aria-live="polite">
            {open.length === 0
              ? "Nothing waiting. All quiet."
              : open.length === 1
                ? "1 report waiting."
                : `${open.length} reports waiting.`}
          </p>
        </header>

        {open.length > 0 ? (
          <section aria-labelledby="open-reports" className="flex flex-col gap-4">
            <h2 id="open-reports" className={HEADING}>
              Waiting <span className="text-ink tabular-nums">· {open.length}</span>
            </h2>
            <ol className="flex flex-col gap-6">
              {open.map((report) => (
                <li key={report.id}>
                  <OpenReport report={report} />
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <section aria-labelledby="decided-reports" className="flex flex-col gap-4">
          <h2 id="decided-reports" className={HEADING}>
            Recently decided
          </h2>
          {decided.length === 0 ? (
            <p className="text-sm text-secondary">No decisions yet.</p>
          ) : (
            <ol className="rounded-2xl bg-card divide-y divide-hairline">
              {decided.map((report) => (
                <li key={report.id} className="flex flex-col gap-1 px-4 py-3">
                  <p className="text-sm">
                    <span className="font-medium">
                      {report.status === "resolved" ? "Resolved" : "Dismissed"}
                    </span>{" "}
                    by {handleOf(report.decided_by_handle)}
                    {report.decided_at ? (
                      <>
                        {" · "}
                        <PostTime createdAt={report.decided_at} />
                      </>
                    ) : null}
                  </p>
                  <p className="text-sm text-secondary line-clamp-2 wrap-anywhere">
                    {reportReasonLabel(report.reason)}: {report.reported_text}
                  </p>
                  <p className="font-mono text-xs text-secondary">
                    Note {NOTE_STATE[report.target_state]?.toLowerCase() ?? report.target_state}
                  </p>
                  {report.decision_note ? (
                    <p className="text-sm italic whitespace-pre-line wrap-anywhere">
                      {report.decision_note}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}

function OpenReport({ report }: { report: ReportRow }) {
  const author = report.author_display_name ?? "A deleted account";
  const titleId = `report-${report.id}`;

  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-2xl bg-card p-5"
    >
      <header className="flex flex-col gap-1">
        <h3 id={titleId} className="font-display text-2xl leading-tight">
          {reportReasonLabel(report.reason)}
        </h3>
        <p className="text-sm text-secondary wrap-anywhere">
          Reported by {report.reporter_display_name ?? "a deleted account"}
          {report.reporter_handle ? (
            <span className="font-mono text-xs"> @{report.reporter_handle}</span>
          ) : null}
          {" · "}
          <PostTime createdAt={report.created_at} />
        </p>
      </header>

      {report.note ? (
        <p className="border-l-2 border-ember/50 pl-3 text-sm whitespace-pre-line wrap-anywhere">
          {report.note}
        </p>
      ) : null}

      <figure className="flex flex-col gap-3 rounded-xl border border-dashed border-hairline bg-paper p-4">
        <blockquote className="whitespace-pre-line wrap-anywhere leading-relaxed text-body">
          {report.reported_text}
        </blockquote>
        <figcaption className="flex flex-col gap-1 text-sm text-secondary">
          <span className="wrap-anywhere">
            <span aria-hidden="true">— </span>
            {author}
            {report.author_handle ? (
              <span className="font-mono text-xs"> @{report.author_handle}</span>
            ) : null}
            {" in "}
            <span className="text-ink">{report.trip_name ?? "a deleted trip"}</span>
          </span>
          <span className="self-start font-mono text-xs uppercase tracking-[0.15em] px-2 py-1 rounded border border-hairline">
            {NOTE_STATE[report.target_state] ?? report.target_state}
          </span>
        </figcaption>
      </figure>

      <ReportDecision
        action={decideReportAction.bind(null, report.id)}
        subject={`${author}'s note`}
        noteIsUp={report.target_state === "up"}
      />
    </article>
  );
}

function handleOf(handle: string | null): string {
  return handle ? `@${handle}` : "a deleted account";
}
