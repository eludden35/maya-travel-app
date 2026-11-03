import "server-only";

import type { Database } from "@/database.types";
import { DataAccessError } from "@/lib/errors";
import type { Share } from "@/lib/money";
import { toFailure, toResult, type Failure } from "@/lib/rpc-result";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";

/**
 * Server-only expense helpers (Bead tripplanner-2o5.2).
 *
 * Every write goes through an RPC in
 * `supabase/migrations/20261103160000_expenses.sql`; clients can only read
 * `expenses` and `expense_shares`. Each RPC checks the caller and the whole
 * expense, charges the `expense_write` rate limit in the same transaction,
 * and answers with a status that the write helpers below turn into a result
 * union. Read helpers throw `DataAccessError` when a query fails.
 *
 * Amounts are integer minor units of the trip's currency (`trips.currency`),
 * as in `lib/money.ts`: read what people type with `parseMoney` and show it
 * with `formatMoney`. For an equal split the server computes the shares by
 * the rule `splitEqual` implements, so a form can preview them with
 * `splitEqual` and show the same cents.
 *
 * Founder decisions (test plan section 12, 2026-11-03):
 *   - the payer, the member who added an expense, or the organizer may edit
 *     or delete it (`forbidden` for anyone else in the trip);
 *   - a delete is soft: the expense disappears for every member, and the row
 *     is kept for the founder;
 *   - once someone on an expense has left the trip, it can't be edited or
 *     deleted (`member_left`), so a settled balance never moves.
 *
 * Money-privacy note (ADR 0002): RLS returns these rows to the trip's members
 * only, whatever the trip's visibility; anyone else reads nothing.
 */

export type ExpenseSplit = Database["public"]["Enums"]["expense_split"];

export type Expense = {
  id: string;
  tripId: string;
  payerId: string;
  description: string;
  amount: number;
  split: ExpenseSplit;
  /** Everyone in the split, by member id; a share can be zero. */
  shares: Share[];
  /** Null once the member who added it has deleted their account. */
  createdBy: string | null;
  createdAt: string;
  /** Null until the first edit. */
  updatedBy: string | null;
  updatedAt: string;
};

/**
 * An expense as entered. An equal split names who's in it and the server
 * computes the shares; an exact split gives each member's share.
 */
export type ExpenseInput = {
  payerId: string;
  description: string;
  amount: number;
} & (
  | { split: "equal"; memberIds: readonly string[] }
  | { split: "exact"; shares: readonly Share[] }
);

type ExpenseInputError =
  | "invalid_description"
  | "invalid_amount"
  | "invalid_shares"
  | "not_a_member"
  | "shares_mismatch";

export type CreateExpenseResult =
  | { ok: true; expenseId: string }
  | {
      ok: false;
      error:
        | ExpenseInputError
        | "not_found"
        | "rate_limited"
        | "unauthorized"
        | "unknown";
    };

export type UpdateExpenseResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | ExpenseInputError
        | "not_found"
        | "forbidden"
        | "member_left"
        | "rate_limited"
        | "unauthorized"
        | "unknown";
    };

export type DeleteExpenseResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "not_found"
        | "forbidden"
        | "member_left"
        | "rate_limited"
        | "unauthorized"
        | "unknown";
    };

type ExpenseRow = Pick<
  Database["public"]["Tables"]["expenses"]["Row"],
  | "id"
  | "trip_id"
  | "payer_id"
  | "description"
  | "amount"
  | "split"
  | "created_by"
  | "created_at"
  | "updated_by"
  | "updated_at"
> & {
  expense_shares: Pick<
    Database["public"]["Tables"]["expense_shares"]["Row"],
    "member_id" | "amount"
  >[];
};

const EXPENSE_COLUMNS =
  "id, trip_id, payer_id, description, amount, split, created_by, created_at, updated_by, updated_at, expense_shares(member_id, amount)";

/**
 * A trip's expenses with their shares, newest first. Returns `[]` unless the
 * viewer is a member, even on a public trip. Deleted expenses never appear.
 */
export async function listTripExpenses(tripId: string): Promise<Expense[]> {
  if (!isUuid(tripId)) {
    return [];
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses")
    .select(EXPENSE_COLUMNS)
    .eq("trip_id", tripId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id");

  if (error) {
    throw new DataAccessError("listTripExpenses", error);
  }
  return (data ?? []).map(toExpense);
}

/**
 * One expense with its shares, for the edit form. `null` when it doesn't
 * exist, was deleted, or isn't in a trip the viewer belongs to.
 */
export async function getExpense(expenseId: string): Promise<Expense | null> {
  if (!isUuid(expenseId)) {
    return null;
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses")
    .select(EXPENSE_COLUMNS)
    .eq("id", expenseId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new DataAccessError("getExpense", error);
  }
  return data ? toExpense(data) : null;
}

/** Add an expense to a trip. Any member can add one, paid by any member. */
export async function createExpense(
  tripId: string,
  input: ExpenseInput,
): Promise<CreateExpenseResult> {
  if (!isUuid(tripId)) {
    return { ok: false, error: "not_found" };
  }
  const problem = expenseInputError(input);
  if (problem) {
    return { ok: false, error: problem };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_expense", { p_trip_id: tripId, ...toRpcArgs(input) })
    .single();

  if (!error && data?.status === "ok" && data.expense_id) {
    return { ok: true, expenseId: data.expense_id };
  }
  return toFailure(
    "createExpense",
    data?.status ?? null,
    error,
    CREATE_EXPENSE_ERRORS,
  );
}

/** Replace an expense's payer, description, amount, split and shares. */
export async function updateExpense(
  expenseId: string,
  input: ExpenseInput,
): Promise<UpdateExpenseResult> {
  if (!isUuid(expenseId)) {
    return { ok: false, error: "not_found" };
  }
  const problem = expenseInputError(input);
  if (problem) {
    return { ok: false, error: problem };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_expense", {
    p_expense_id: expenseId,
    ...toRpcArgs(input),
  });
  return toResult("updateExpense", data, error, UPDATE_EXPENSE_ERRORS);
}

/** Delete an expense for everyone in the trip. */
export async function deleteExpense(
  expenseId: string,
): Promise<DeleteExpenseResult> {
  if (!isUuid(expenseId)) {
    return { ok: false, error: "not_found" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_expense", {
    p_expense_id: expenseId,
  });
  return toResult("deleteExpense", data, error, DELETE_EXPENSE_ERRORS);
}

/**
 * Catches what can't reach the RPC as typed, so it gets a typed error rather
 * than "unknown": amounts must be whole numbers of minor units, and an id
 * that isn't a UUID can't belong to a member. The RPC checks everything else
 * (ranges, duplicates, the description, whether an exact split adds up).
 */
export function expenseInputError(
  input: ExpenseInput,
): "invalid_amount" | "invalid_shares" | "not_a_member" | null {
  if (!Number.isSafeInteger(input.amount)) {
    return "invalid_amount";
  }
  if (input.split !== "equal" && input.split !== "exact") {
    return "invalid_shares";
  }
  if (
    input.split === "exact" &&
    !input.shares.every((share) => Number.isSafeInteger(share.amount))
  ) {
    return "invalid_shares";
  }
  const memberIds =
    input.split === "exact"
      ? input.shares.map((share) => share.memberId)
      : input.memberIds;
  if (![input.payerId, ...memberIds].every(isUuid)) {
    return "not_a_member";
  }
  return null;
}

/** An `expenses` row with its embedded shares, as an `Expense`. */
export function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    tripId: row.trip_id,
    payerId: row.payer_id,
    description: row.description,
    amount: row.amount,
    split: row.split,
    // By member id, so the same expense always reads the same.
    shares: row.expense_shares
      .map((share) => ({ memberId: share.member_id, amount: share.amount }))
      .sort((a, b) =>
        a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0,
      ),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

function toRpcArgs(input: ExpenseInput) {
  return {
    p_payer_id: input.payerId,
    p_description: input.description,
    p_amount: input.amount,
    p_split: input.split,
    p_member_ids:
      input.split === "exact"
        ? input.shares.map((share) => share.memberId)
        : [...input.memberIds],
    p_amounts:
      input.split === "exact"
        ? input.shares.map((share) => share.amount)
        : undefined,
  };
}

const INPUT_ERRORS: readonly ExpenseInputError[] = [
  "invalid_description",
  "invalid_amount",
  "invalid_shares",
  "not_a_member",
  "shares_mismatch",
];
const CREATE_EXPENSE_ERRORS: readonly Failure<CreateExpenseResult>[] = [
  ...INPUT_ERRORS,
  "not_found",
  "rate_limited",
  "unauthorized",
];
const UPDATE_EXPENSE_ERRORS: readonly Failure<UpdateExpenseResult>[] = [
  ...INPUT_ERRORS,
  "not_found",
  "forbidden",
  "member_left",
  "rate_limited",
  "unauthorized",
];
const DELETE_EXPENSE_ERRORS: readonly Failure<DeleteExpenseResult>[] = [
  "not_found",
  "forbidden",
  "member_left",
  "rate_limited",
  "unauthorized",
];
