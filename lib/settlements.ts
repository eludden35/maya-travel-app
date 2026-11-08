import "server-only";

import type { Database } from "@/database.types";
import { DataAccessError } from "@/lib/errors";
import type { Balance } from "@/lib/money";
import { toFailure, toResult, type Failure } from "@/lib/rpc-result";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";

/**
 * Server-only settlement and balance helpers (Bead tripplanner-2o5.3).
 *
 * A settlement records that one member paid another outside the app. Every
 * write goes through an RPC in the `settlements` migration; clients can only
 * read `settlements`, and nobody can change or delete a row. Each RPC checks the
 * caller, charges the `settlement_write` rate limit in the same transaction,
 * and answers with a status that the write helpers below turn into a result
 * union. Read helpers throw `DataAccessError` when a query fails.
 *
 * Founder decisions (test plan section 12, Q3, 2026-11-08):
 *   - either party records or voids a settlement (`forbidden` for anyone else
 *     in the trip);
 *   - it counts toward balances at once, and nobody confirms it;
 *   - any amount is accepted, so partial payments and overpayments record as
 *     entered, and a typo gets voided.
 *
 * A void is a new row, not a change: the same amount paid back the other way,
 * with `reversesId` pointing at the settlement it reverses. Summing rows nets
 * it out, but a history should show it as "voided" on the original payment,
 * not as a payment of its own.
 *
 * Amounts are integer minor units of the trip's currency (`trips.currency`),
 * as in `lib/money.ts`. `getTripBalances` returns the `Balance` shape that
 * `simplifyDebts` takes, so suggested payments come straight from it.
 *
 * Money-privacy note (ADR 0002): settlements and balances reach the trip's
 * members only, whatever the trip's visibility; anyone else gets nothing.
 */

export type Settlement = {
  id: string;
  tripId: string;
  /** The member who paid. On a void, who was paid by the original. */
  fromId: string;
  /** The member who was paid. On a void, who paid in the original. */
  toId: string;
  amount: number;
  /** Set on a void: the settlement it reverses. */
  reversesId: string | null;
  /** Who recorded this row, which on a void is who voided it. */
  createdBy: string;
  createdAt: string;
};

/**
 * A member's net position on a trip: positive is owed money, negative owes.
 * `isMember` is false for someone who left with a balance, which only data
 * from before the balance rule can hold; they keep the rows summing to zero.
 */
export type TripBalance = Balance & { isMember: boolean };

export type SettlementInput = {
  fromId: string;
  toId: string;
  amount: number;
};

type SettlementInputError = "invalid_amount" | "same_member" | "not_a_member";

export type RecordSettlementResult =
  | { ok: true; settlementId: string }
  | {
      ok: false;
      error:
        | SettlementInputError
        | "not_found"
        | "forbidden"
        | "rate_limited"
        | "unauthorized"
        | "unknown";
    };

export type VoidSettlementResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "not_found"
        | "forbidden"
        | "already_voided"
        | "member_left"
        | "rate_limited"
        | "unauthorized"
        | "unknown";
    };

type SettlementRow = Pick<
  Database["public"]["Tables"]["settlements"]["Row"],
  | "id"
  | "trip_id"
  | "from_id"
  | "to_id"
  | "amount"
  | "reverses_id"
  | "created_by"
  | "created_at"
>;

type TripBalanceRow =
  Database["public"]["Functions"]["trip_balances"]["Returns"][number];

const SETTLEMENT_COLUMNS =
  "id, trip_id, from_id, to_id, amount, reverses_id, created_by, created_at";

/**
 * Each member's net balance on a trip. Returns `[]` unless the viewer is a
 * member, even on a public trip. Every current member has a row, zero
 * included, and the rows sum to zero.
 */
export async function getTripBalances(tripId: string): Promise<TripBalance[]> {
  if (!isUuid(tripId)) {
    return [];
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("trip_balances", {
    p_trip_id: tripId,
  });

  if (error) {
    throw new DataAccessError("getTripBalances", error);
  }
  return (data ?? []).map(toTripBalance);
}

/**
 * A trip's settlements and voids, newest first. Returns `[]` unless the
 * viewer is a member, even on a public trip.
 */
export async function listTripSettlements(
  tripId: string,
): Promise<Settlement[]> {
  if (!isUuid(tripId)) {
    return [];
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("settlements")
    .select(SETTLEMENT_COLUMNS)
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false })
    .order("id");

  if (error) {
    throw new DataAccessError("listTripSettlements", error);
  }
  return (data ?? []).map(toSettlement);
}

/** Record that one member paid another. Only those two can record it. */
export async function recordSettlement(
  tripId: string,
  input: SettlementInput,
): Promise<RecordSettlementResult> {
  if (!isUuid(tripId)) {
    return { ok: false, error: "not_found" };
  }
  const problem = settlementInputError(input);
  if (problem) {
    return { ok: false, error: problem };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("record_settlement", {
      p_trip_id: tripId,
      p_from_id: input.fromId,
      p_to_id: input.toId,
      p_amount: input.amount,
    })
    .single();

  if (!error && data?.status === "ok" && data.settlement_id) {
    return { ok: true, settlementId: data.settlement_id };
  }
  return toFailure(
    "recordSettlement",
    data?.status ?? null,
    error,
    RECORD_SETTLEMENT_ERRORS,
  );
}

/** Void a settlement. Either party can, once, while both are in the trip. */
export async function voidSettlement(
  settlementId: string,
): Promise<VoidSettlementResult> {
  if (!isUuid(settlementId)) {
    return { ok: false, error: "not_found" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("void_settlement", {
    p_settlement_id: settlementId,
  });
  return toResult("voidSettlement", data, error, VOID_SETTLEMENT_ERRORS);
}

/**
 * Catches what can't reach the RPC as typed, so it gets a typed error rather
 * than "unknown": amounts must be whole numbers of minor units, and an id
 * that isn't a UUID can't belong to a member. The RPC checks everything else.
 */
export function settlementInputError(
  input: SettlementInput,
): SettlementInputError | null {
  if (!Number.isSafeInteger(input.amount)) {
    return "invalid_amount";
  }
  if (!isUuid(input.fromId) || !isUuid(input.toId)) {
    return "not_a_member";
  }
  if (input.fromId === input.toId) {
    return "same_member";
  }
  return null;
}

/** A `settlements` row as a `Settlement`. */
export function toSettlement(row: SettlementRow): Settlement {
  return {
    id: row.id,
    tripId: row.trip_id,
    fromId: row.from_id,
    toId: row.to_id,
    amount: row.amount,
    reversesId: row.reverses_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/** A `trip_balances` row as a `TripBalance`, which `simplifyDebts` accepts. */
export function toTripBalance(row: TripBalanceRow): TripBalance {
  return { memberId: row.member_id, amount: row.net, isMember: row.is_member };
}

const RECORD_SETTLEMENT_ERRORS: readonly Failure<RecordSettlementResult>[] = [
  "invalid_amount",
  "same_member",
  "not_a_member",
  "not_found",
  "forbidden",
  "rate_limited",
  "unauthorized",
];
const VOID_SETTLEMENT_ERRORS: readonly Failure<VoidSettlementResult>[] = [
  "not_found",
  "forbidden",
  "already_voided",
  "member_left",
  "rate_limited",
  "unauthorized",
];
