/**
 * Thrown by server-only read helpers when Supabase returns an error.
 *
 * Read helpers used to log and return `null` / `[]`, which turned a broken
 * RLS policy into "you have no profile" and sent every signed-in user back to
 * onboarding for months (see tasks/lessons.md, 2026-10-29). Throwing lets
 * the nearest `error.tsx` render and lets error monitoring record it.
 *
 * Write helpers keep returning result unions; this is for reads only. Next.js
 * replaces server error messages with a digest before anything reaches the
 * browser, so the Postgres message stays in server logs.
 */
export class DataAccessError extends Error {
  readonly code: string | undefined;

  constructor(operation: string, cause: { code?: string; message: string }) {
    super(
      `${operation} failed${cause.code ? ` (${cause.code})` : ""}: ${cause.message}`,
    );
    this.name = "DataAccessError";
    this.code = cause.code;
  }
}
