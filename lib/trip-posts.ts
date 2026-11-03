import "server-only";

import type { Database } from "@/database.types";
import { DataAccessError } from "@/lib/errors";
import { toFailure, toResult, type Failure } from "@/lib/rpc-result";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-only helpers for text posts inside a trip, and for reporting them
 * (Bead tripplanner-2o5.6).
 *
 * Every read and write goes through an RPC in
 * `supabase/migrations/20261103210000_trip_posts_and_reports.sql`. A trip's
 * posts are for its members only, whatever the trip's visibility; clients
 * have no INSERT, UPDATE or DELETE on `trip_posts` or `reports`. Each write
 * RPC checks who is calling, validates, charges its rate limit (`post` and
 * `post_daily`, or `report`) in the same transaction, and answers with a
 * status that becomes a result union here. So the Server Actions don't wrap
 * these in `withRateLimit`: that would charge twice.
 *
 * Reads throw `DataAccessError` when a query fails, so an outage doesn't
 * look like a trip with no posts.
 */

export type TripPost =
  Database["public"]["Functions"]["get_trip_posts"]["Returns"][number];

/** How many posts the trip page shows at a time. */
export const TRIP_POSTS_PAGE_SIZE = 50;

export type TripPostsPage = { posts: TripPost[]; hasOlder: boolean };

export type CreateTripPostResult =
  | { ok: true; postId: string }
  | {
      ok: false;
      error:
        | "not_found"
        | "invalid_body"
        | "rate_limited"
        | "unauthorized"
        | "unknown";
    };

export type DeleteTripPostResult =
  | { ok: true }
  | {
      ok: false;
      error: "not_found" | "forbidden" | "unauthorized" | "unknown";
    };

export type ReportTripPostResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "not_found"
        | "own_post"
        | "already_reported"
        | "invalid_reason"
        | "invalid_note"
        | "rate_limited"
        | "unauthorized"
        | "unknown";
    };

/**
 * A page of a trip's posts, newest first: the newest page, or the one after
 * `before` (the oldest post of the page before it). Empty unless the viewer
 * is a member. A post taken down after a report is left out, except for its
 * author, who gets it marked `taken_down`. Author names show across a block
 * between members (founder decision Q5).
 */
export async function getTripPosts(
  tripId: string,
  before?: string,
): Promise<TripPostsPage> {
  const supabase = await createClient();

  // One more than a page, to know whether there's an older one.
  const { data, error } = await supabase.rpc("get_trip_posts", {
    p_trip_id: tripId,
    p_before: before,
    p_limit: TRIP_POSTS_PAGE_SIZE + 1,
  });

  if (error) {
    throw new DataAccessError("getTripPosts", error);
  }
  const rows = data ?? [];
  return {
    posts: rows.slice(0, TRIP_POSTS_PAGE_SIZE),
    hasOlder: rows.length > TRIP_POSTS_PAGE_SIZE,
  };
}

/** Post `body` in a trip the caller belongs to. The RPC trims and checks it. */
export async function createTripPost(
  tripId: string,
  body: string,
): Promise<CreateTripPostResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_trip_post", { p_trip_id: tripId, p_body: body })
    .single();

  if (!error && data?.status === "ok" && data.post_id) {
    return { ok: true, postId: data.post_id };
  }
  return toFailure(
    "createTripPost",
    data?.status ?? null,
    error,
    CREATE_TRIP_POST_ERRORS,
  );
}

/** Delete one of the caller's own posts. Nobody else can (founder decision Q1). */
export async function deleteTripPost(
  postId: string,
): Promise<DeleteTripPostResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_trip_post", {
    p_post_id: postId,
  });
  return toResult("deleteTripPost", data, error, DELETE_TRIP_POST_ERRORS);
}

/**
 * Report someone else's post to the moderators. Its author isn't told, and
 * only the reporter and moderators can read the report.
 */
export async function reportTripPost(
  postId: string,
  reason: string,
  note: string | null,
): Promise<ReportTripPostResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_trip_post", {
    p_post_id: postId,
    p_reason: reason,
    p_note: note ?? undefined,
  });
  return toResult("reportTripPost", data, error, REPORT_TRIP_POST_ERRORS);
}

const CREATE_TRIP_POST_ERRORS: readonly Failure<CreateTripPostResult>[] = [
  "not_found",
  "invalid_body",
  "rate_limited",
  "unauthorized",
];
const DELETE_TRIP_POST_ERRORS: readonly Failure<DeleteTripPostResult>[] = [
  "not_found",
  "forbidden",
  "unauthorized",
];
const REPORT_TRIP_POST_ERRORS: readonly Failure<ReportTripPostResult>[] = [
  "not_found",
  "own_post",
  "already_reported",
  "invalid_reason",
  "invalid_note",
  "rate_limited",
  "unauthorized",
];
