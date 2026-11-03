/**
 * Result unions for the status-returning write RPCs (Bead tripplanner-2o5.2;
 * the pattern comes from the trip helpers in tripplanner-718, and
 * `lib/trips.ts` still keeps its own copy).
 *
 * Those RPCs answer with a status instead of raising, so a refused write
 * keeps its rate-limit charge. A status the caller knows passes through. A
 * transport error, or a status this module doesn't know yet (a newer
 * migration's), becomes "unknown" and is logged; raw database text never
 * reaches the UI.
 */

/** The error codes of a result union. */
export type Failure<R> = R extends { ok: false; error: infer E } ? E : never;

type RpcError = { code?: string; message: string } | null;

/** Turn a status-returning RPC's answer into a result union. */
export function toResult<E extends string>(
  operation: string,
  status: string | null,
  error: RpcError,
  known: readonly E[],
): { ok: true } | { ok: false; error: E | "unknown" } {
  if (!error && status === "ok") {
    return { ok: true };
  }
  return toFailure(operation, status, error, known);
}

export function toFailure<E extends string>(
  operation: string,
  status: string | null,
  error: RpcError,
  known: readonly E[],
): { ok: false; error: E | "unknown" } {
  if (error) {
    console.error(`${operation} failed`, error.code, error.message);
    return { ok: false, error: "unknown" };
  }
  const match = known.find((candidate) => candidate === status);
  if (match) {
    return { ok: false, error: match };
  }
  console.error(`${operation} returned an unexpected status`, status);
  return { ok: false, error: "unknown" };
}
