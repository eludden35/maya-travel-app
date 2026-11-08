import type { Expense } from "@/lib/expenses";
import {
  checkExactSplit,
  formatMoney,
  simplifyDebts,
  splitEqual,
  type Balance,
  type CurrencyCode,
  type Share,
  type Transfer,
} from "@/lib/money";
import type { Settlement, TripBalance } from "@/lib/settlements";

/**
 * What the money screens on a trip page show (Bead tripplanner-2o5.5), worked
 * out from the rows the data layer returns. Pure, so the rules about who sees
 * which control, how a void reads, and how names read in a ledger are tested
 * without a browser. The database still enforces every rule; this only decides
 * what to offer.
 */

export type Person = {
  id: string;
  name: string;
  isViewer: boolean;
  hasLeft: boolean;
};

export type People = (id: string) => Person;

/**
 * Looks people up by id. Someone who left keeps their real name, marked as
 * having left (founder decision, 2026-11-08). The fallback covers a ledger
 * row whose name couldn't be read, so a row never shows a raw id.
 */
export function peopleFrom(
  members: readonly { profile_id: string; display_name: string }[],
  formerMembers: readonly { profile_id: string; display_name: string }[],
  viewerId: string,
): People {
  const known = new Map<string, Person>();
  const add = (
    row: { profile_id: string; display_name: string },
    hasLeft: boolean,
  ) =>
    known.set(row.profile_id, {
      id: row.profile_id,
      name: row.display_name,
      isViewer: row.profile_id === viewerId,
      hasLeft,
    });
  formerMembers.forEach((row) => add(row, true));
  members.forEach((row) => add(row, false));
  return (id) =>
    known.get(id) ?? {
      id,
      name: "Someone who left",
      isViewer: id === viewerId,
      hasLeft: false,
    };
}

/** How a person reads in a ledger row: "You", "Bob Okafor", "Cleo (left)". */
export function ledgerName(person: Person): string {
  if (person.isViewer) {
    return "You";
  }
  return person.hasLeft ? `${person.name} (left)` : person.name;
}

/** How a person reads mid-sentence: "Paid by you", "Marked by Bob Okafor". */
export function sentenceName(person: Person): string {
  return person.isViewer ? "you" : ledgerName(person);
}

/** "You pay Alice", "Bob pays you"; with `"paid"`, "You paid Alice". */
export function paymentLine(
  from: Person,
  to: Person,
  tense: "pays" | "paid",
): string {
  const payee = sentenceName(to);
  if (from.isViewer) {
    return `You ${tense === "pays" ? "pay" : "paid"} ${payee}`;
  }
  return `${ledgerName(from)} ${tense} ${payee}`;
}

/** The word under a name in the balances: "owes", or "owe" beside "You". */
export function balanceWord(amount: number, isViewer: boolean): string {
  if (amount === 0) {
    return "all square";
  }
  if (amount > 0) {
    return isViewer ? "are owed" : "is owed";
  }
  return isViewer ? "owe" : "owes";
}

export type Standing =
  | { kind: "empty" }
  | { kind: "settled" }
  | { kind: "square" }
  | { kind: "owes" | "owed"; amount: number; counterparts: string[] };

/**
 * The viewer's position for the big number at the top of the money section.
 * `counterparts` come from the suggested payments, so "to" and "from" name the
 * people the viewer would actually settle with.
 */
export function viewerStanding(
  balances: readonly Balance[],
  transfers: readonly Transfer[],
  viewerId: string,
  expenseCount: number,
): Standing {
  // A payment can outlive the costs it paid for, so no costs isn't "empty"
  // unless the balances say so too.
  if (balances.every((balance) => balance.amount === 0)) {
    return { kind: expenseCount === 0 ? "empty" : "settled" };
  }
  const amount =
    balances.find((balance) => balance.memberId === viewerId)?.amount ?? 0;
  if (amount === 0) {
    return { kind: "square" };
  }
  return {
    kind: amount < 0 ? "owes" : "owed",
    amount: Math.abs(amount),
    counterparts: transfers.flatMap((transfer) =>
      amount < 0
        ? transfer.from === viewerId
          ? [transfer.to]
          : []
        : transfer.to === viewerId
          ? [transfer.from]
          : [],
    ),
  };
}

export type SuggestedPayment = Transfer & {
  /** The viewer is one of the two, and both are still in the trip. */
  canMark: boolean;
  /** One of the two left the trip, so nobody can record it here. */
  hasFormerMember: boolean;
};

/** The suggested payments, the viewer's own first. */
export function suggestedPayments(
  balances: readonly TripBalance[],
  viewerId: string,
): SuggestedPayment[] {
  const current = new Set(
    balances.filter((balance) => balance.isMember).map((b) => b.memberId),
  );
  const involves = (transfer: Transfer) =>
    transfer.from === viewerId || transfer.to === viewerId;
  return simplifyDebts(balances)
    .map((transfer) => {
      const hasFormerMember =
        !current.has(transfer.from) || !current.has(transfer.to);
      return {
        ...transfer,
        hasFormerMember,
        canMark: involves(transfer) && !hasFormerMember,
      };
    })
    .sort((a, b) => Number(involves(b)) - Number(involves(a)));
}

export type ExpenseAccess = "editable" | "frozen" | "none";

/**
 * Who sees Edit and Delete: the payer, whoever added it and the organizer
 * (test plan section 12, Q1). Once someone on the expense has left, it can't
 * change, and those same people are told why.
 */
export function expenseAccess(
  expense: Pick<Expense, "payerId" | "createdBy" | "shares">,
  {
    viewerId,
    organizerId,
    memberIds,
  }: {
    viewerId: string;
    organizerId: string;
    memberIds: ReadonlySet<string>;
  },
): ExpenseAccess {
  const mayChange =
    viewerId === expense.payerId ||
    viewerId === expense.createdBy ||
    viewerId === organizerId;
  if (!mayChange) {
    return "none";
  }
  const everyoneStayed = [
    expense.payerId,
    ...expense.shares.map((share) => share.memberId),
  ].every((id) => memberIds.has(id));
  return everyoneStayed ? "editable" : "frozen";
}

export type PaymentEntry = {
  id: string;
  fromId: string;
  toId: string;
  amount: number;
  markedBy: string;
  markedAt: string;
  voided: { by: string; at: string } | null;
  canVoid: boolean;
};

/**
 * The payment history, newest first. A void is a row of its own with the
 * parties swapped; here it reads as "voided" on the payment it reverses and
 * never as a payment. Either party can void, once, while both are members.
 */
export function paymentHistory(
  settlements: readonly Settlement[],
  {
    viewerId,
    memberIds,
  }: { viewerId: string; memberIds: ReadonlySet<string> },
): PaymentEntry[] {
  const voids = new Map(
    settlements.flatMap((row) =>
      row.reversesId ? [[row.reversesId, row] as const] : [],
    ),
  );
  return settlements
    .filter((row) => !row.reversesId)
    .map((row) => {
      const reversal = voids.get(row.id);
      return {
        id: row.id,
        fromId: row.fromId,
        toId: row.toId,
        amount: row.amount,
        markedBy: row.createdBy,
        markedAt: row.createdAt,
        voided: reversal
          ? { by: reversal.createdBy, at: reversal.createdAt }
          : null,
        canVoid:
          !reversal &&
          (viewerId === row.fromId || viewerId === row.toId) &&
          memberIds.has(row.fromId) &&
          memberIds.has(row.toId),
      };
    });
}

export type EqualPreview = {
  shares: Share[];
  /** The minor units an even split leaves over. */
  leftover: number;
  /** Who picks up the extra, payer first. */
  extraIds: string[];
};

/** The shares the server will compute, and where the odd cents went. */
export function previewEqualSplit(
  amount: number,
  memberIds: readonly string[],
  payerId: string,
): EqualPreview {
  const shares = splitEqual(amount, memberIds, payerId);
  const leftover = amount % memberIds.length;
  const base = (amount - leftover) / memberIds.length;
  const extraIds = shares
    .filter((share) => share.amount > base)
    .map((share) => share.memberId)
    .sort((a, b) =>
      a === payerId ? -1 : b === payerId ? 1 : a < b ? -1 : a > b ? 1 : 0,
    );
  return { shares, leftover, extraIds };
}

/** The leftover line: leftover cents are shown, not hidden. */
export function leftoverLine(
  leftover: number,
  names: readonly string[],
  currency: CurrencyCode,
): string {
  return `${formatMoney(leftover, currency)} won't split evenly, so the extra goes to ${listOf(names)}.`;
}

export type ExactSplitLine = { ok: boolean; text: string };

/** How an exact split stands against the amount, as the form shows it. */
export function exactSplitLine(
  amount: number,
  shares: readonly Share[],
  currency: CurrencyCode,
): ExactSplitLine {
  if (shares.length === 0) {
    return {
      ok: false,
      text: `${formatMoney(amount, currency)} still unassigned.`,
    };
  }
  const check = checkExactSplit(amount, shares);
  if (check.ok) {
    return { ok: true, text: `Adds up to ${formatMoney(amount, currency)}.` };
  }
  const difference = formatMoney(check.difference, currency);
  return {
    ok: false,
    text:
      check.error === "unassigned"
        ? `${difference} still unassigned.`
        : `${difference} over.`,
  };
}

/** Names in a sentence: "A", "A and B", "A, B and C". */
export function listOf(names: readonly string[]): string {
  if (names.length < 2) {
    return names.join("");
  }
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
