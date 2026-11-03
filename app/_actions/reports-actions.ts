"use server";

import { revalidatePath } from "next/cache";

import { readDecisionNote, type ReportDecision } from "@/lib/post-fields";
import { decideReport } from "@/lib/reports";
import { isUuid } from "@/lib/uuid";

/**
 * Server Action for a moderator's decision on a report (Bead
 * tripplanner-2o5.6). `decide_report` checks that the caller is a moderator;
 * anyone else gets the same "not available" answer as for a report that
 * doesn't exist. The pressed button names the decision.
 */

export type DecisionState = { error: string | null };

export async function decideReportAction(
  reportId: string,
  _previous: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const decision = formData.get("decision");
  if (!isUuid(reportId)) {
    return { error: DECISION_COPY.not_found };
  }
  if (!isDecision(decision)) {
    return { error: DECISION_COPY.invalid_decision };
  }
  const result = await decideReport(
    reportId,
    decision,
    readDecisionNote(formData),
  );
  // Someone else got there first; the page will show their decision.
  if (!result.ok && result.error !== "already_decided") {
    return { error: DECISION_COPY[result.error] };
  }
  revalidatePath("/admin/reports");
  revalidatePath("/");
  return { error: null };
}

function isDecision(value: unknown): value is ReportDecision {
  return value === "resolve" || value === "dismiss";
}

const DECISION_COPY = {
  not_found: "This report isn't available anymore.",
  invalid_decision: "Choose a decision first.",
  invalid_note: "Keep the note under 1,000 characters.",
  unauthorized: "Your session ended. Sign in again to keep going.",
  unknown: "Something went wrong, so nothing was recorded. Please try again.",
} as const;
