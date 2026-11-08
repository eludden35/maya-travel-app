import type { ExpenseInput } from "@/lib/expenses";
import {
  MAX_AMOUNT_MINOR,
  formatMoney,
  parseMoney,
  type CurrencyCode,
  type ParseMoneyResult,
  type Share,
} from "@/lib/money";
import { exactSplitLine } from "@/lib/trip-money";

/**
 * Reads the cost and payment forms (Bead tripplanner-2o5.5). The browser runs
 * this before submitting, so an exact split that doesn't add up never leaves
 * the phone, and the Server Action runs it again on what actually arrived.
 * Nothing is rounded: "12.345" is refused, not corrected.
 */

export const EXPENSE_DESCRIPTION_MAX = 120;

export type ExpenseField = "description" | "amount" | "payer_id" | "split";

export type ExpenseFormProblem = { field: ExpenseField; message: string };

export type ReadExpenseResult =
  | { ok: true; input: ExpenseInput }
  | ({ ok: false } & ExpenseFormProblem);

/** Why an amount won't do, or null when it's above zero and in range. */
export function amountProblem(
  result: ParseMoneyResult,
  currency: CurrencyCode,
): string | null {
  if (result.ok) {
    return result.amount > 0 ? null : "Enter an amount above zero.";
  }
  switch (result.error) {
    case "empty":
      return "Enter an amount, like 24.50.";
    case "invalid":
      return "Use digits only, like 24.50.";
    case "too_many_decimals":
      return "Two decimals at most, like 12.34.";
    case "too_large":
      return `The most it can be is ${formatMoney(MAX_AMOUNT_MINOR, currency)}.`;
  }
}

export function readExpenseForm(
  formData: FormData,
  currency: CurrencyCode,
): ReadExpenseResult {
  const description = text(formData, "description");
  if (description === "" || description.length > EXPENSE_DESCRIPTION_MAX) {
    return {
      ok: false,
      field: "description",
      message: "Say what it was: one line, up to 120 characters.",
    };
  }

  const parsed = parseMoney(text(formData, "amount"), currency);
  const problem = amountProblem(parsed, currency);
  if (problem || !parsed.ok) {
    return { ok: false, field: "amount", message: problem ?? "" };
  }
  const amount = parsed.amount;

  const payerId = text(formData, "payer_id");
  if (payerId === "") {
    return { ok: false, field: "payer_id", message: "Pick who paid." };
  }

  if (text(formData, "split") === "exact") {
    return readExactSplit(formData, { payerId, description, amount }, currency);
  }

  const memberIds = formData
    .getAll("member")
    .filter((value): value is string => typeof value === "string");
  if (memberIds.length === 0) {
    return { ok: false, field: "split", message: "Pick at least one person." };
  }
  return {
    ok: true,
    input: { payerId, description, amount, split: "equal", memberIds },
  };
}

function readExactSplit(
  formData: FormData,
  base: { payerId: string; description: string; amount: number },
  currency: CurrencyCode,
): ReadExpenseResult {
  const shares: Share[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("share_") || typeof value !== "string") {
      continue;
    }
    if (value.trim() === "") {
      continue;
    }
    const parsed = parseMoney(value, currency);
    if (!parsed.ok) {
      return {
        ok: false,
        field: "split",
        message: "Each share needs a plain amount, like 12.50.",
      };
    }
    shares.push({ memberId: key.slice("share_".length), amount: parsed.amount });
  }
  const line = exactSplitLine(base.amount, shares, currency);
  if (!line.ok) {
    return {
      ok: false,
      field: "split",
      message: `${line.text} Shares have to add up to ${formatMoney(base.amount, currency)}.`,
    };
  }
  return { ok: true, input: { ...base, split: "exact", shares } };
}

export type PaymentField = "person" | "amount";

export type ReadPaymentResult =
  | { ok: true; fromId: string; toId: string; amount: number }
  | { ok: false; field: PaymentField; message: string };

export function readPaymentForm(
  formData: FormData,
  currency: CurrencyCode,
): ReadPaymentResult {
  const fromId = text(formData, "from_id");
  const toId = text(formData, "to_id");
  if (fromId === "" || toId === "") {
    return { ok: false, field: "person", message: "Pick who the payment was with." };
  }
  const parsed = parseMoney(text(formData, "amount"), currency);
  const problem = amountProblem(parsed, currency);
  if (problem || !parsed.ok) {
    return { ok: false, field: "amount", message: problem ?? "" };
  }
  return { ok: true, fromId, toId, amount: parsed.amount };
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
