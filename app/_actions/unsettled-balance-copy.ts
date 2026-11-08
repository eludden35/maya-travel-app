import { formatMoney, type CurrencyCode } from "@/lib/money";

/**
 * What to say when a balance stops someone leaving, being removed from or
 * deleting a trip (Bead tripplanner-2o5.3; test plan S7). It lives beside
 * `trips-actions.ts` because every export of a `"use server"` file becomes an
 * action, and because the wording deserves tests.
 *
 * Amounts come from `trip_balances`: positive is owed money, negative owes.
 * Each message gives the amount when the numbers are at hand. If reading them
 * failed, plain wording still explains the refusal, which stands either way.
 */

export type MemberBalance = { amount: number; currency: CurrencyCode };

export type UnsettledMember = {
  name: string;
  isViewer: boolean;
  amount: number;
};

/** More than this many people reads better as a count. */
const MAX_NAMED_MEMBERS = 3;

export function leaveBlockedCopy(balance: MemberBalance | null): string {
  if (!balance || balance.amount === 0) {
    return "Your balance on this trip isn't settled yet. Settle up and mark it as paid, then you can leave.";
  }
  const money = formatMoney(Math.abs(balance.amount), balance.currency);
  return balance.amount < 0
    ? `You owe ${money} on this trip. Settle up and mark it as paid, then you can leave.`
    : `You're owed ${money} on this trip. Once you're paid back and it's marked as paid, you can leave.`;
}

export function removeBlockedCopy(
  name: string | null,
  balance: MemberBalance | null,
): string {
  const who = name ?? "This member";
  if (!balance || balance.amount === 0) {
    return `${who}'s balance on this trip isn't settled yet. Once it is, you can remove them.`;
  }
  const money = formatMoney(Math.abs(balance.amount), balance.currency);
  return balance.amount < 0
    ? `${who} owes ${money} on this trip. Once they've settled up and it's marked as paid, you can remove them.`
    : `${who} is owed ${money} on this trip. Once they're paid back and it's marked as paid, you can remove them.`;
}

export function deleteBlockedCopy(
  unsettled: readonly UnsettledMember[] | null,
  currency: CurrencyCode | null,
): string {
  const next =
    "Once every balance is settled and marked as paid, you can delete the trip.";
  if (!unsettled || !currency || unsettled.length === 0) {
    return `Not everyone on this trip is settled up yet. ${next}`;
  }
  if (unsettled.length > MAX_NAMED_MEMBERS) {
    return `${unsettled.length} people on this trip still have balances to settle. ${next}`;
  }
  const standings = unsettled.map((member) => standing(member, currency));
  return `Not everyone is settled up yet: ${listOf(standings)}. ${next}`;
}

function standing(
  { name, isViewer, amount }: UnsettledMember,
  currency: CurrencyCode,
): string {
  const money = formatMoney(Math.abs(amount), currency);
  if (isViewer) {
    return amount < 0 ? `you owe ${money}` : `you're owed ${money}`;
  }
  return amount < 0 ? `${name} owes ${money}` : `${name} is owed ${money}`;
}

function listOf(items: readonly string[]): string {
  if (items.length < 3) {
    return items.join(" and ");
  }
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
