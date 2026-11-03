/**
 * Money arithmetic for trips (Bead tripplanner-2o5.4): equal and exact
 * splits, suggested payments, and reading and showing amounts.
 *
 * Amounts are whole numbers of the currency's minor unit (cents for USD),
 * one currency per trip, as the database stores them. Nothing here does
 * floating-point arithmetic: splits use integer division and
 * remainders, and parsing and formatting work on digit strings. The module
 * is pure (no I/O, no Supabase), so a form, the Server Action behind it and
 * the expense RPCs' checks agree on every cent.
 *
 * Every money field is called `amount`. A bad argument (a fraction of a
 * cent, a member listed twice, an unsupported currency) is a bug in the
 * caller and throws `RangeError`; a problem with what a person typed comes
 * back as a result union, like the rest of `lib/`.
 */

/**
 * The currencies a trip can use, in the order the trip form lists them: the
 * name the form shows, the number of minor-unit digits (ISO 4217) and the
 * symbol `formatMoney` shows. This is the app's one currency list; the trip
 * form reads it through `TRIP_CURRENCIES` in `lib/trip-fields.ts`. It must
 * hold the same codes as `private.is_supported_currency()`, which checks
 * `trips.currency`, and `lib/money.test.ts` compares the two. All are
 * two-decimal, as the money UI shows two decimals (test plan S4-N4).
 */
export const CURRENCIES = {
  USD: { name: "US dollar", exponent: 2, symbol: "$" },
  CAD: { name: "Canadian dollar", exponent: 2, symbol: "CA$" },
  MXN: { name: "Mexican peso", exponent: 2, symbol: "MX$" },
  EUR: { name: "Euro", exponent: 2, symbol: "€" },
  GBP: { name: "British pound", exponent: 2, symbol: "£" },
  AUD: { name: "Australian dollar", exponent: 2, symbol: "A$" },
} as const satisfies Record<
  string,
  { name: string; exponent: number; symbol: string }
>;

export type CurrencyCode = keyof typeof CURRENCIES;

/**
 * The most one expense, share or payment can be: 999,999,999.99 in a
 * two-decimal currency. Tens of thousands of these still add up to less
 * than 2^53, so every total stays exact in a JavaScript number.
 */
export const MAX_AMOUNT_MINOR = 99_999_999_999;

/** A member's portion of an expense. */
export type Share = { memberId: string; amount: number };

/** A member's net position on a trip: positive is owed money, negative owes. */
export type Balance = { memberId: string; amount: number };

/** A suggested payment: `from` pays `to`. */
export type Transfer = { from: string; to: string; amount: number };

export type ExactSplitCheck =
  | { ok: true }
  | { ok: false; error: "unassigned" | "over"; difference: number };

export type ParseMoneyResult =
  | { ok: true; amount: number }
  | {
      ok: false;
      error: "empty" | "invalid" | "too_many_decimals" | "too_large";
    };

export type FormatMoneyOptions = {
  /**
   * "auto" (the default) signs negatives only. "exceptZero" also puts a plus
   * on positives, for balances: "+$48.00", "−$14.00", "$0.00".
   */
  signDisplay?: "auto" | "exceptZero";
};

// The typographic minus, as in the UAT test plan; screen readers say "minus".
const MINUS = "−";

// ASCII digits, optionally grouped in threes by commas, then an optional
// decimal point and fraction: "12", "1,234.5", ".5", "12.".
const AMOUNT_PATTERN =
  /^(?:([0-9]{1,3}(?:,[0-9]{3})+)|([0-9]*))(?:\.([0-9]*))?$/;

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && Object.hasOwn(CURRENCIES, value);
}

/**
 * Splits `amount` equally between `memberIds`; shares come back in the same
 * order.
 *
 * Everyone gets `amount / n` rounded down. The leftover minor units
 * (`amount % n`, fewer than n) go one each to the payer first, if they are in
 * the split, then to the other members in ascending ID order. So shares
 * differ by at most one cent, whoever paid absorbs the odd cent, and the same
 * amount, payer and members always give the same shares, whatever order the
 * members arrive in (docs/uat/uat-1-test-plan.md §12, Q2).
 *
 * IDs compare by UTF-16 code unit, which for lowercase UUIDs is Postgres's
 * uuid order, so an RPC can apply the same rule with
 * `row_number() over (order by member_id = payer_id desc, member_id)`.
 */
export function splitEqual(
  amount: number,
  memberIds: readonly string[],
  payerId: string,
): Share[] {
  assertAmount(amount);
  assertDistinctMembers(memberIds);
  if (memberIds.length === 0) {
    throw new RangeError("An equal split needs at least one member");
  }
  const leftover = amount % memberIds.length;
  const base = (amount - leftover) / memberIds.length;
  const others = memberIds.filter((id) => id !== payerId).sort(compareIds);
  const order =
    others.length < memberIds.length ? [payerId, ...others] : others;
  const getsExtra = new Set(order.slice(0, leftover));
  return memberIds.map((memberId) => ({
    memberId,
    amount: getsExtra.has(memberId) ? base + 1 : base,
  }));
}

/**
 * Checks shares a person entered against the expense amount. They must add
 * up exactly; nothing is rounded or reassigned. On a mismatch, `difference`
 * is how much is still unassigned or over, for the form to show. A share may
 * be zero.
 */
export function checkExactSplit(
  amount: number,
  shares: readonly Share[],
): ExactSplitCheck {
  assertAmount(amount);
  assertDistinctMembers(shares.map((share) => share.memberId));
  if (shares.length === 0) {
    throw new RangeError("An exact split needs at least one share");
  }
  let total = 0;
  for (const share of shares) {
    if (
      !Number.isSafeInteger(share.amount) ||
      share.amount < 0 ||
      share.amount > MAX_AMOUNT_MINOR
    ) {
      throw new RangeError(
        `A share must be a whole number of minor units from 0 to ${MAX_AMOUNT_MINOR}, got ${share.amount}`,
      );
    }
    total += share.amount;
  }
  if (total < amount) {
    return { ok: false, error: "unassigned", difference: amount - total };
  }
  if (total > amount) {
    return { ok: false, error: "over", difference: total - amount };
  }
  return { ok: true };
}

/**
 * Suggests payments that bring every balance to zero.
 *
 * Anyone who owes exactly what someone else is owed pays them directly. Then
 * the member who owes the most pays the member owed the most, as much as
 * clears one of them, until nobody owes anything. Every payment clears at
 * least one balance, so n members need at most n - 1 payments, and members
 * who owe only pay while members who are owed only receive. (Finding the
 * fewest payments possible is NP-hard; n - 1 is the bound the Bead asks
 * for.) Ties go to the lower member ID and the result is sorted by payer,
 * then payee, so the same balances always give the same list.
 *
 * Throws if the balances don't sum to zero. A trip's always do, so a nonzero
 * sum means the caller passed the wrong rows.
 */
export function simplifyDebts(balances: readonly Balance[]): Transfer[] {
  assertDistinctMembers(balances.map((balance) => balance.memberId));
  let sum = 0;
  for (const balance of balances) {
    if (!Number.isSafeInteger(balance.amount)) {
      throw new RangeError(
        `A balance must be a whole number of minor units, got ${balance.amount}`,
      );
    }
    sum += balance.amount;
  }
  if (sum !== 0) {
    throw new RangeError(`Balances must sum to zero, got ${sum}`);
  }

  // Working copies: what each member still has to pay or receive.
  const debtors = balances
    .filter((balance) => balance.amount < 0)
    .map((balance) => ({ memberId: balance.memberId, amount: -balance.amount }))
    .sort(largestFirst);
  const creditors = balances
    .filter((balance) => balance.amount > 0)
    .map((balance) => ({ ...balance }))
    .sort(largestFirst);
  const transfers: Transfer[] = [];
  const pay = (debtor: Balance, creditor: Balance, amount: number) => {
    transfers.push({ from: debtor.memberId, to: creditor.memberId, amount });
    debtor.amount -= amount;
    creditor.amount -= amount;
  };

  for (const debtor of debtors) {
    const match = creditors.find(
      (creditor) => creditor.amount === debtor.amount,
    );
    if (match) {
      pay(debtor, match, debtor.amount);
    }
  }
  for (let debtor = largest(debtors); debtor; debtor = largest(debtors)) {
    // Both sides still hold the same total, so someone is still owed.
    const creditor = largest(creditors) as Balance;
    pay(debtor, creditor, Math.min(debtor.amount, creditor.amount));
  }

  return transfers.sort(
    (a, b) => compareIds(a.from, b.from) || compareIds(a.to, b.to),
  );
}

/**
 * Reads an amount a person typed as minor units. Nothing is rounded: "12.345"
 * in a two-decimal currency is refused, not rounded to 12.35. Accepts "12",
 * "12.5", ".5" and "1,234.56" (commas only between groups of three); refuses
 * signs, exponents, letters, symbols and "12,50". Zero parses, because an
 * exact share can be zero; the split helpers are what require an expense to
 * be more than zero.
 */
export function parseMoney(
  input: string,
  currency: CurrencyCode,
): ParseMoneyResult {
  const { exponent } = currencyInfo(currency);
  const text = input.trim();
  if (text === "") {
    return { ok: false, error: "empty" };
  }
  const match = AMOUNT_PATTERN.exec(text);
  const whole = (match?.[1] ?? match?.[2] ?? "").replace(/,/g, "");
  const fraction = match?.[3] ?? "";
  if (!match || whole + fraction === "") {
    return { ok: false, error: "invalid" };
  }
  if (fraction.length > exponent) {
    return { ok: false, error: "too_many_decimals" };
  }
  // Without leading zeros, the digit count says whether it can fit.
  const digits = `${whole}${fraction.padEnd(exponent, "0")}`.replace(
    /^0+(?=[0-9])/,
    "",
  );
  if (
    digits.length > String(MAX_AMOUNT_MINOR).length ||
    Number(digits) > MAX_AMOUNT_MINOR
  ) {
    return { ok: false, error: "too_large" };
  }
  return { ok: true, amount: Number(digits) };
}

/**
 * Shows an amount: "$1,234.56", "−$14.00", "A$0.50". Always the currency's
 * full number of decimals, so a column of amounts lines up in tabular
 * figures. Built from digit strings in one fixed (en-US) style rather than
 * with `Intl.NumberFormat`, so the server and the browser render the same
 * string and the output doesn't depend on the runtime's locale data.
 */
export function formatMoney(
  amount: number,
  currency: CurrencyCode,
  { signDisplay = "auto" }: FormatMoneyOptions = {},
): string {
  const { exponent, symbol } = currencyInfo(currency);
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(
      `An amount must be a whole number of minor units, got ${amount}`,
    );
  }
  const sign =
    amount < 0 ? MINUS : amount > 0 && signDisplay === "exceptZero" ? "+" : "";
  const [whole, fraction] = decimalParts(Math.abs(amount), exponent);
  const grouped = whole.replace(/\B(?=(?:[0-9]{3})+$)/g, ",");
  return `${sign}${symbol}${grouped}${fraction ? `.${fraction}` : ""}`;
}

/**
 * The plain decimal form of an amount ("1234.56") for an input's value when
 * editing. `parseMoney` reads it back to the same amount.
 */
export function toMoneyInput(amount: number, currency: CurrencyCode): string {
  const { exponent } = currencyInfo(currency);
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError(
      `An input amount must be a whole number of minor units from 0, got ${amount}`,
    );
  }
  const [whole, fraction] = decimalParts(amount, exponent);
  return fraction ? `${whole}.${fraction}` : whole;
}

function currencyInfo(currency: CurrencyCode) {
  if (!isCurrencyCode(currency)) {
    throw new RangeError(`Unsupported currency: ${String(currency)}`);
  }
  return CURRENCIES[currency];
}

function assertAmount(amount: number): void {
  if (
    !Number.isSafeInteger(amount) ||
    amount < 1 ||
    amount > MAX_AMOUNT_MINOR
  ) {
    throw new RangeError(
      `An amount must be a whole number of minor units from 1 to ${MAX_AMOUNT_MINOR}, got ${amount}`,
    );
  }
}

function assertDistinctMembers(memberIds: readonly string[]): void {
  if (new Set(memberIds).size !== memberIds.length) {
    throw new RangeError("The same member is listed more than once");
  }
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function largestFirst(a: Balance, b: Balance): number {
  return b.amount - a.amount || compareIds(a.memberId, b.memberId);
}

// The member with the most left to pay or receive; ties go to the lower ID.
function largest(entries: readonly Balance[]): Balance | undefined {
  return entries.filter((entry) => entry.amount > 0).sort(largestFirst)[0];
}

function decimalParts(
  amount: number,
  exponent: number,
): [whole: string, fraction: string] {
  const digits = String(amount).padStart(exponent + 1, "0");
  const point = digits.length - exponent;
  return [digits.slice(0, point), digits.slice(point)];
}
