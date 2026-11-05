/**
 * Post and report fields, shared by the post forms (client) and the post and
 * report Server Actions (server), so it stays free of Supabase and
 * `server-only` imports (Bead tripplanner-2o5.6).
 *
 * The database is the authority: the RPCs in
 * `supabase/migrations/20261105201232_trip_posts_and_reports.sql` clean up
 * line breaks, trim, validate and answer with a status. The limits and
 * reasons here mirror them so a form can say so up front;
 * `lib/post-fields.test.ts` fails when the two drift apart.
 */

import type { Database } from "@/database.types";

export type ReportReason = Database["public"]["Enums"]["report_reason"];

export const POST_BODY_MAX = 2000;
export const REPORT_NOTE_MAX = 500;
export const DECISION_NOTE_MAX = 1000;

/**
 * Why someone reports a post, in the order the report dialog lists them.
 * Taken from the Community Guidelines' prohibited content.
 */
export const REPORT_REASONS: readonly { code: ReportReason; label: string }[] = [
  { code: "harassment", label: "Harassment or threats" },
  { code: "hate", label: "Hate speech" },
  { code: "private_info", label: "Someone's private information" },
  { code: "sexual", label: "Sexual content" },
  { code: "spam", label: "Spam or a scam" },
  { code: "other", label: "Something else" },
];

export function reportReasonLabel(code: ReportReason): string {
  return REPORT_REASONS.find((reason) => reason.code === code)?.label ?? code;
}

/** A moderator's decision on a report. */
export type ReportDecision = "resolve" | "dismiss";

/** The text of a submitted post, as typed. The RPC trims and checks it. */
export function readPostBody(formData: FormData): string {
  const value = formData.get("body");
  return typeof value === "string" ? value : "";
}

/** A submitted report: its reason, and its note or `null` when blank. */
export function readReport(formData: FormData): {
  reason: string;
  note: string | null;
} {
  return {
    reason: readText(formData, "reason"),
    note: readText(formData, "note") || null,
  };
}

/** A moderator's note on a decision, or `null` when blank. */
export function readDecisionNote(formData: FormData): string | null {
  return readText(formData, "note") || null;
}

function readText(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}
