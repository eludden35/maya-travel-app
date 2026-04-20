import "server-only";

import { randomUUID } from "node:crypto";

import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/database.types";
import { RATE_LIMITS, withRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

type ImagesClient = SupabaseClient<Database>;

/**
 * Server-only image-pipeline helpers (Bead tripplanner-s3a.4).
 *
 * Single legitimate write path for user-uploaded images. Five public helpers:
 *
 *   - uploadPendingImage   — server-side EXIF strip + bucket put + row insert.
 *   - getImageById         — RLS-respecting read.
 *   - markImageApproved    — moderator-only; cross-bucket move + audit.
 *   - markImageRejected    — moderator-only; status flip + audit.
 *   - getPendingImageQueue — moderator-only; oldest-first review queue.
 *
 * Hard rule (.cursor/rules/supabase-security.mdc #2 + ADR 0002): every
 * uploaded image is invisible to anyone but the uploader and moderators
 * until a human moderator approves it. The substrate satisfies the rule
 * via three orthogonal layers (images RLS + storage.objects RLS on
 * images-pending + write-only-by-admin-client images-approved); see the
 * 20260419190000_images_pipeline.sql header for the full citation. This
 * module is the only legitimate way the substrate gets exercised.
 *
 * EXIF strip is implemented via `sharp` re-encoding the file. `sharp`
 * drops ALL metadata as a side effect of re-encoding — EXIF GPS, color-
 * profile injection, polyglot/jpg-with-PDF-payload all get neutralized
 * because the output buffer is freshly written from the decoded pixel
 * matrix. The strip happens BEFORE any bucket write or DB insert; if the
 * file isn't a parseable image, the helper short-circuits with
 * `invalid_image_type` and no row exists.
 */

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

export type ImageRow = Database["public"]["Tables"]["images"]["Row"];
type ImageInsert = Database["public"]["Tables"]["images"]["Insert"];
type ModerationDecisionInsert =
  Database["public"]["Tables"]["moderation_decisions"]["Insert"];
export type ImageState = Database["public"]["Enums"]["image_state"];
export type RejectionReason = Database["public"]["Enums"]["rejection_reason"];

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB; mirrors images.bytes CHECK.
type AcceptedMime = "image/jpeg" | "image/webp" | "image/png";

const PENDING_BUCKET = "images-pending";
const APPROVED_BUCKET = "images-approved";

export type UploadResult =
  | { ok: true; image: ImageRow }
  | {
      ok: false;
      error:
        | "rate_limited"
        | "invalid_image_type"
        | "file_too_large"
        | "exif_strip_failed"
        | "storage_failed"
        | "unauthorized"
        | "unknown";
      retryAfterSeconds?: number;
    };

export type ApproveResult =
  | { ok: true; image: ImageRow }
  | {
      ok: false;
      error:
        | "not_found"
        | "wrong_state"
        | "storage_failed"
        | "unauthorized"
        | "unknown";
    };

export type RejectResult =
  | { ok: true; image: ImageRow }
  | {
      ok: false;
      error: "not_found" | "wrong_state" | "unauthorized" | "unknown";
    };

// ----------------------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------------------

async function isModerator(
  client: ImagesClient,
  profileId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("profiles")
    .select("is_moderator")
    .eq("id", profileId)
    .maybeSingle();
  if (error) {
    console.error("isModerator check failed", error.message);
    return false;
  }
  return data?.is_moderator === true;
}

function extensionForMime(mime: AcceptedMime): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/png":
      return "png";
  }
}

type StripResult =
  | {
      ok: true;
      buffer: Buffer;
      mime: AcceptedMime;
      width: number | null;
      height: number | null;
    }
  | { ok: false; error: "invalid_image_type" | "exif_strip_failed" };

/**
 * Re-encode `input` into a canonical jpeg/webp/png buffer with ALL metadata
 * stripped. Side effect: validates the file is actually an image of an
 * accepted format.
 *
 * Implementation note: `sharp` drops metadata by default unless `.withMetadata()`
 * is called explicitly. We never call that, so EXIF (including GPS), XMP,
 * IPTC, and ICC profile blocks are dropped. The pixel matrix is fully decoded
 * and re-encoded, which neutralizes polyglot / malicious-color-profile attacks
 * because the output bytes are freshly written.
 */
async function stripExifAndReencode(input: Buffer): Promise<StripResult> {
  let pipeline: sharp.Sharp;
  let metadata: sharp.Metadata;
  try {
    pipeline = sharp(input, { failOn: "error" }).rotate();
    metadata = await pipeline.metadata();
  } catch {
    return { ok: false, error: "invalid_image_type" };
  }

  const format = metadata.format;
  let outputMime: AcceptedMime;
  let encoded: Buffer;
  try {
    if (format === "jpeg" || format === "jpg") {
      outputMime = "image/jpeg";
      encoded = await pipeline.jpeg({ quality: 90 }).toBuffer();
    } else if (format === "webp") {
      outputMime = "image/webp";
      encoded = await pipeline.webp({ quality: 90 }).toBuffer();
    } else if (format === "png") {
      outputMime = "image/png";
      encoded = await pipeline.png().toBuffer();
    } else {
      return { ok: false, error: "invalid_image_type" };
    }
  } catch (err) {
    console.error(
      "stripExifAndReencode encode failed",
      err instanceof Error ? err.message : String(err),
    );
    return { ok: false, error: "exif_strip_failed" };
  }

  return {
    ok: true,
    buffer: encoded,
    mime: outputMime,
    width: typeof metadata.width === "number" ? metadata.width : null,
    height: typeof metadata.height === "number" ? metadata.height : null,
  };
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/**
 * Server-only upload entrypoint. Called by per-consumer Server Action wrappers
 * (e.g. tripplanner-s3a.21 avatar upload, tripplanner-s3a.7 post composer).
 *
 * Order of operations (each step short-circuits on failure):
 *   1. `withRateLimit(IMAGES_UPLOAD)` — per-user throttle (10/hour).
 *   2. file-size check (<= 10 MB).
 *   3. `sharp` strip + re-encode → canonical jpeg/webp/png buffer.
 *      The strip happens BEFORE any bucket write or DB insert, satisfying
 *      the AC line "EXIF GPS strip runs server-side before any row is
 *      inserted."
 *   4. admin-client `upload` into images-pending/{uploader}/{uuid}.{ext}.
 *      Uses the admin client (RLS-bypass) so the bucket write is uniform
 *      with the approve/reject paths; the storage_pending_insert_self
 *      policy would also accept this write under the user's session.
 *   5. user-session `insert` into `images` (RLS-checked via
 *      images_insert_self_pending). If this fails, we delete the orphaned
 *      bucket object so we don't leak bytes.
 *
 * Returns a discriminated-union result; never throws across the trust
 * boundary.
 *
 * TODO(s3a.5): once the CSAM scan ships, this helper should insert with
 * `state = 'pending_media'` and call into the s3a.5 vendor wrapper, which
 * UPDATEs to `pending_review` on a passing scan (and remains in
 * `pending_media` on vendor outage — failure-closed). Until then we insert
 * directly with `state = 'pending_review'` so the existing four-state
 * machine collapses to the AC's three-state set at runtime.
 */
export async function uploadPendingImage(
  file: File,
  opts: { uploaderId: string; intendedUse: "avatar" | "post" },
): Promise<UploadResult> {
  const rate = await withRateLimit(RATE_LIMITS.IMAGES_UPLOAD, async () => {
    if (file.size > MAX_BYTES) {
      return { ok: false as const, error: "file_too_large" as const };
    }
    if (file.size <= 0) {
      return { ok: false as const, error: "invalid_image_type" as const };
    }

    const sessionClient = await createServerClient();
    const {
      data: { user },
    } = await sessionClient.auth.getUser();
    if (!user || user.id !== opts.uploaderId) {
      return { ok: false as const, error: "unauthorized" as const };
    }

    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const stripped = await stripExifAndReencode(inputBuffer);
    if (!stripped.ok) {
      return { ok: false as const, error: stripped.error };
    }

    const imageId = randomUUID();
    const ext = extensionForMime(stripped.mime);
    const pendingPath = `${opts.uploaderId}/${imageId}.${ext}`;

    const adminClient = createAdminClient();
    const { error: uploadError } = await adminClient.storage
      .from(PENDING_BUCKET)
      .upload(pendingPath, stripped.buffer, {
        contentType: stripped.mime,
        upsert: false,
      });
    if (uploadError) {
      console.error(
        "uploadPendingImage storage upload failed",
        uploadError.message,
      );
      return { ok: false as const, error: "storage_failed" as const };
    }

    const insertRow: ImageInsert = {
      id: imageId,
      uploader_id: opts.uploaderId,
      // TODO(s3a.5): change to "pending_media" once the CSAM scan landing
      // in tripplanner-s3a.5 owns the pending_media → pending_review
      // transition. Inserting directly as pending_review until then keeps
      // the existing AC three-state set live at runtime.
      state: "pending_review",
      intended_use: opts.intendedUse,
      pending_path: pendingPath,
      bytes: stripped.buffer.length,
      width: stripped.width,
      height: stripped.height,
      mime_type: stripped.mime,
    };

    const { data: inserted, error: insertError } = await sessionClient
      .from("images")
      .insert(insertRow)
      .select("*")
      .single();

    if (insertError || !inserted) {
      // Roll back the orphaned bucket object so we don't leak bytes.
      const { error: cleanupError } = await adminClient.storage
        .from(PENDING_BUCKET)
        .remove([pendingPath]);
      if (cleanupError) {
        console.error(
          "uploadPendingImage cleanup-after-insert-failure remove failed",
          cleanupError.message,
        );
      }
      console.error(
        "uploadPendingImage insert failed",
        insertError?.code,
        insertError?.message,
      );
      return { ok: false as const, error: "unknown" as const };
    }

    return { ok: true as const, image: inserted };
  });

  if (!rate.ok) {
    if (rate.error === "rate_limited") {
      return {
        ok: false,
        error: "rate_limited",
        retryAfterSeconds: rate.retryAfterSeconds,
      };
    }
    return { ok: false, error: rate.error };
  }

  // Inner work returned its own discriminated union. Hoist it out of the
  // rate-limit envelope.
  return rate.value;
}

/**
 * Fetch an image row by id. Respects RLS — pending images return null for
 * non-uploader, non-moderator viewers. Used by per-consumer render paths
 * (e.g. avatar render) and by the moderator queue UI (s3a.6).
 */
export async function getImageById(id: string): Promise<ImageRow | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("images")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("getImageById failed", error.message);
    return null;
  }
  return data;
}

/**
 * Approve an image. Only callable by moderators. Side effects, in order:
 *   1. read-and-verify (must exist; must be in pending_media or
 *      pending_review).
 *   2. admin-client `copy` from images-pending → images-approved.
 *   3. UPDATE images.state = 'approved' + approved_path + reviewed_at +
 *      reviewed_by, via the admin client (uniform with the bucket move).
 *   4. INSERT moderation_decisions row.
 *   5. admin-client `remove` of the pending object. A failure here is
 *      logged but treated as success; the moderation-decision audit row
 *      is the source of truth, and an orphaned pending file gets pruned
 *      by the rejected-cleanup follow-up job (plan §10).
 *
 * Idempotency: a second call after success finds the row in 'approved'
 * and returns `wrong_state`.
 */
export async function markImageApproved(
  id: string,
  opts: { moderatorId: string; notes?: string },
): Promise<ApproveResult> {
  const sessionClient = await createServerClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user || user.id !== opts.moderatorId) {
    return { ok: false, error: "unauthorized" };
  }
  if (!(await isModerator(sessionClient, user.id))) {
    return { ok: false, error: "unauthorized" };
  }

  const adminClient = createAdminClient();
  const { data: existing, error: readError } = await adminClient
    .from("images")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (readError) {
    console.error("markImageApproved read failed", readError.message);
    return { ok: false, error: "unknown" };
  }
  if (!existing) {
    return { ok: false, error: "not_found" };
  }
  if (existing.state !== "pending_media" && existing.state !== "pending_review") {
    return { ok: false, error: "wrong_state" };
  }

  const ext = existing.pending_path.split(".").pop() ?? "bin";
  const approvedPath = `${existing.id}.${ext}`;

  const { error: copyError } = await adminClient.storage
    .from(PENDING_BUCKET)
    .copy(existing.pending_path, approvedPath, {
      destinationBucket: APPROVED_BUCKET,
    });
  if (copyError) {
    console.error("markImageApproved copy failed", copyError.message);
    return { ok: false, error: "storage_failed" };
  }

  const { data: updated, error: updateError } = await adminClient
    .from("images")
    .update({
      state: "approved",
      approved_path: approvedPath,
      reviewed_at: new Date().toISOString(),
      reviewed_by: opts.moderatorId,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (updateError || !updated) {
    console.error(
      "markImageApproved update failed",
      updateError?.code,
      updateError?.message,
    );
    return { ok: false, error: "unknown" };
  }

  const decision: ModerationDecisionInsert = {
    image_id: id,
    verdict: "approve",
    notes: opts.notes ?? null,
    reviewer_kind: "human",
    reviewer_id: opts.moderatorId,
  };
  const { error: auditError } = await adminClient
    .from("moderation_decisions")
    .insert(decision);
  if (auditError) {
    console.error(
      "markImageApproved audit insert failed",
      auditError.code,
      auditError.message,
    );
    return { ok: false, error: "unknown" };
  }

  const { error: removeError } = await adminClient.storage
    .from(PENDING_BUCKET)
    .remove([existing.pending_path]);
  if (removeError) {
    // The pending-bucket object is now orphaned but the public surface is
    // correct. Log + return ok; cleanup job sweeps later.
    console.error(
      "markImageApproved pending remove failed (orphan left)",
      removeError.message,
    );
  }

  return { ok: true, image: updated };
}

/**
 * Reject an image. Side effects: state flip to 'rejected' + reason +
 * reviewed_at + reviewed_by; INSERT moderation_decisions. Pending file is
 * RETAINED in images-pending for the audit window and pruned by a future
 * cleanup job (plan §10). Idempotency: a second call finds the row in
 * 'rejected' and returns `wrong_state`.
 */
export async function markImageRejected(
  id: string,
  opts: {
    moderatorId: string;
    reason: RejectionReason;
    notes?: string;
  },
): Promise<RejectResult> {
  const sessionClient = await createServerClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user || user.id !== opts.moderatorId) {
    return { ok: false, error: "unauthorized" };
  }
  if (!(await isModerator(sessionClient, user.id))) {
    return { ok: false, error: "unauthorized" };
  }

  const adminClient = createAdminClient();
  const { data: existing, error: readError } = await adminClient
    .from("images")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (readError) {
    console.error("markImageRejected read failed", readError.message);
    return { ok: false, error: "unknown" };
  }
  if (!existing) {
    return { ok: false, error: "not_found" };
  }
  if (existing.state !== "pending_media" && existing.state !== "pending_review") {
    return { ok: false, error: "wrong_state" };
  }

  const { data: updated, error: updateError } = await adminClient
    .from("images")
    .update({
      state: "rejected",
      rejection_reason: opts.reason,
      reviewed_at: new Date().toISOString(),
      reviewed_by: opts.moderatorId,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (updateError || !updated) {
    console.error(
      "markImageRejected update failed",
      updateError?.code,
      updateError?.message,
    );
    return { ok: false, error: "unknown" };
  }

  const decision: ModerationDecisionInsert = {
    image_id: id,
    verdict: "reject",
    rejection_reason: opts.reason,
    notes: opts.notes ?? null,
    reviewer_kind: "human",
    reviewer_id: opts.moderatorId,
  };
  const { error: auditError } = await adminClient
    .from("moderation_decisions")
    .insert(decision);
  if (auditError) {
    console.error(
      "markImageRejected audit insert failed",
      auditError.code,
      auditError.message,
    );
    return { ok: false, error: "unknown" };
  }

  return { ok: true, image: updated };
}

/**
 * Read the moderator review queue, ordered by oldest-first. Caller must be
 * a moderator; the underlying RLS already enforces this for non-moderators
 * (they would just see their own rows back), but the helper checks up-front
 * so the caller gets a clean empty array rather than a confusing partial
 * view.
 *
 * Called by tripplanner-s3a.6 (moderator queue UI).
 */
export async function getPendingImageQueue(
  opts: { limit?: number; intendedUse?: "avatar" | "post" } = {},
): Promise<ImageRow[]> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  if (!(await isModerator(supabase, user.id))) return [];

  let query = supabase
    .from("images")
    .select("*")
    .in("state", ["pending_media", "pending_review"])
    .order("created_at", { ascending: true })
    .limit(opts.limit ?? 50);

  if (opts.intendedUse) {
    query = query.eq("intended_use", opts.intendedUse);
  }

  const { data, error } = await query;
  if (error) {
    console.error("getPendingImageQueue failed", error.message);
    return [];
  }
  return data ?? [];
}
