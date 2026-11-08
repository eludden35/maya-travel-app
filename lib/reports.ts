import "server-only";

import type { Database } from "@/database.types";
import { DataAccessError } from "@/lib/errors";
import type { ReportDecision } from "@/lib/post-fields";
import { toResult, type Failure } from "@/lib/rpc-result";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-only helpers for the moderators' reports page (Bead
 * tripplanner-2o5.6). Members file reports through `reportTripPost` in
 * `lib/trip-posts.ts`.
 *
 * Moderators are checked in the database, not here: `list_reports` returns
 * rows only when `public.is_moderator()` says the caller is one (it answers
 * only about the caller), `decide_report` answers anyone else `not_found`,
 * and RLS on `reports` shows a non-moderator only their own reports. The page
 * also checks the viewer's own `profiles.is_moderator` before it renders,
 * which no one can set for themselves.
 *
 * A moderator who isn't in a trip reads only what was reported from it,
 * never its other posts, and never an amount (test plan S6-N4).
 */

export type ReportRow =
  Database["public"]["Functions"]["list_reports"]["Returns"][number];

export type DecideReportResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "not_found"
        | "invalid_decision"
        | "invalid_note"
        | "already_decided"
        | "unauthorized"
        | "unknown";
    };

/** Open reports, oldest first, so the longest-waiting one is on top. */
export async function listOpenReports(): Promise<ReportRow[]> {
  return listReports(true, 50);
}

/** The latest decisions, newest first. */
export async function listDecidedReports(limit = 20): Promise<ReportRow[]> {
  return listReports(false, limit);
}

/** How many reports are waiting, for the moderators' link on home. */
export async function countOpenReports(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");

  if (error) {
    throw new DataAccessError("countOpenReports", error);
  }
  return count ?? 0;
}

/**
 * Record a moderator's decision. "resolve" takes the post down and resolves
 * every open report on it; "dismiss" closes this report and leaves the post
 * up. Who decided, when, and the note are recorded either way.
 */
export async function decideReport(
  reportId: string,
  decision: ReportDecision,
  note: string | null,
): Promise<DecideReportResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decide_report", {
    p_report_id: reportId,
    p_decision: decision,
    p_note: note ?? undefined,
  });
  return toResult("decideReport", data, error, DECIDE_REPORT_ERRORS);
}

async function listReports(open: boolean, limit: number): Promise<ReportRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_reports", {
    p_open: open,
    p_limit: limit,
  });

  if (error) {
    throw new DataAccessError("listReports", error);
  }
  return data ?? [];
}

const DECIDE_REPORT_ERRORS: readonly Failure<DecideReportResult>[] = [
  "not_found",
  "invalid_decision",
  "invalid_note",
  "already_decided",
  "unauthorized",
];
