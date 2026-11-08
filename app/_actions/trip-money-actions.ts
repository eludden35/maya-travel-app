"use server";

import { revalidatePath } from "next/cache";

import {
  EXPENSE_COPY,
  RECORD_PAYMENT_COPY,
  VOID_PAYMENT_COPY,
} from "@/app/_actions/trip-money-copy";
import type { ConfirmState } from "@/app/_actions/trips-actions";
import {
  readExpenseForm,
  readPaymentForm,
  type ExpenseField,
  type PaymentField,
} from "@/lib/expense-fields";
import {
  createExpense,
  deleteExpense,
  updateExpense,
} from "@/lib/expenses";
import { isCurrencyCode, type CurrencyCode } from "@/lib/money";
import { recordSettlement, voidSettlement } from "@/lib/settlements";
import { getTripById } from "@/lib/trips";
import { isUuid } from "@/lib/uuid";

/**
 * Server Action wrappers for costs and payments (Bead tripplanner-2o5.5).
 *
 * Same shape as `trips-actions.ts`: ids from the client are checked with
 * `isUuid`, and every message comes from `trip-money-copy.ts`, so no database
 * text reaches the browser. Each RPC charges its own rate limit in the same
 * transaction as the write, so these wrappers don't call `withRateLimit`.
 */

export type ExpenseFormState = {
  error: { field: ExpenseField | null; message: string } | null;
  /** Counts saves, so the sheet knows to close. */
  saved: number;
};

export type PaymentFormState = {
  error: { field: PaymentField | null; message: string } | null;
  saved: number;
};

/** Adds a cost, or replaces one when `expenseId` is set. */
export async function saveExpenseAction(
  tripId: string,
  expenseId: string | null,
  previous: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  if (!isUuid(tripId) || (expenseId !== null && !isUuid(expenseId))) {
    return { ...previous, error: { field: null, message: EXPENSE_COPY.not_found } };
  }
  const currency = await tripCurrency(tripId);
  if (!currency) {
    return { ...previous, error: { field: null, message: EXPENSE_COPY.unknown } };
  }
  const read = readExpenseForm(formData, currency);
  if (!read.ok) {
    return { ...previous, error: { field: read.field, message: read.message } };
  }
  const result = expenseId
    ? await updateExpense(expenseId, read.input)
    : await createExpense(tripId, read.input);
  if (!result.ok) {
    return { ...previous, error: expenseError(result.error) };
  }
  revalidatePaths(tripId);
  return { error: null, saved: previous.saved + 1 };
}

export async function deleteExpenseAction(
  tripId: string,
  expenseId: string,
): Promise<ConfirmState> {
  if (!isUuid(tripId) || !isUuid(expenseId)) {
    return { error: EXPENSE_COPY.not_found };
  }
  const result = await deleteExpense(expenseId);
  // A cost that's already gone is gone either way.
  if (!result.ok && result.error !== "not_found") {
    return { error: EXPENSE_COPY[result.error] };
  }
  revalidatePaths(tripId);
  return { error: null };
}

export async function recordPaymentAction(
  tripId: string,
  previous: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  if (!isUuid(tripId)) {
    return {
      ...previous,
      error: { field: null, message: RECORD_PAYMENT_COPY.not_found },
    };
  }
  const currency = await tripCurrency(tripId);
  if (!currency) {
    return {
      ...previous,
      error: { field: null, message: RECORD_PAYMENT_COPY.unknown },
    };
  }
  const read = readPaymentForm(formData, currency);
  if (!read.ok) {
    return { ...previous, error: { field: read.field, message: read.message } };
  }
  const result = await recordSettlement(tripId, read);
  if (!result.ok) {
    return {
      ...previous,
      error: {
        field: result.error === "invalid_amount" ? "amount" : null,
        message: RECORD_PAYMENT_COPY[result.error],
      },
    };
  }
  revalidatePaths(tripId);
  return { error: null, saved: previous.saved + 1 };
}

export async function voidPaymentAction(
  tripId: string,
  settlementId: string,
): Promise<ConfirmState> {
  if (!isUuid(tripId) || !isUuid(settlementId)) {
    return { error: VOID_PAYMENT_COPY.not_found };
  }
  const result = await voidSettlement(settlementId);
  if (!result.ok) {
    return { error: VOID_PAYMENT_COPY[result.error] };
  }
  revalidatePaths(tripId);
  return { error: null };
}

/** The trip's currency, to read amounts in; null if it can't be read. */
async function tripCurrency(tripId: string): Promise<CurrencyCode | null> {
  try {
    const trip = await getTripById(tripId);
    return trip && isCurrencyCode(trip.currency) ? trip.currency : null;
  } catch (error) {
    console.error("tripCurrency failed", error);
    return null;
  }
}

function revalidatePaths(tripId: string) {
  revalidatePath("/");
  revalidatePath(`/trips/${tripId}`);
}

function expenseError(
  code: keyof typeof EXPENSE_COPY,
): NonNullable<ExpenseFormState["error"]> {
  const field: ExpenseField | null =
    code === "invalid_description"
      ? "description"
      : code === "invalid_amount"
        ? "amount"
        : code === "invalid_shares" || code === "shares_mismatch"
          ? "split"
          : null;
  return { field, message: EXPENSE_COPY[code] };
}
