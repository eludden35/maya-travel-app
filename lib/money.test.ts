import { describe, expect, it } from "vitest";

import {
  CURRENCIES,
  MAX_AMOUNT_MINOR,
  checkExactSplit,
  formatMoney,
  isCurrencyCode,
  parseMoney,
  simplifyDebts,
  splitEqual,
  toMoneyInput,
  type Balance,
  type CurrencyCode,
  type Transfer,
} from "@/lib/money";

const MINUS = "−";

/**
 * Seeded random numbers (mulberry32), so the property tests check the same
 * few thousand cases on every run and a failure names a case to replay.
 */
function seededRandom(seed: number) {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
  /** A whole number from `min` to `max`, inclusive. */
  const int = (min: number, max: number) =>
    min + Math.floor(next() * (max - min + 1));
  return {
    int,
    /** 1 to `maxDigits` digits, so small and large amounts both turn up. */
    amount: (maxDigits = 11) => int(1, 10 ** int(1, maxDigits) - 1),
    /** Distinct lowercase hex IDs, in no particular order. */
    memberIds: (count: number) => {
      const ids = new Set<string>();
      while (ids.size < count) {
        ids.add(int(0, 0xffffffff).toString(16).padStart(8, "0"));
      }
      return [...ids];
    },
  };
}

type Random = ReturnType<typeof seededRandom>;

function total(amounts: readonly number[]): number {
  return amounts.reduce((sum, amount) => sum + amount, 0);
}

/** The first check that fails, with the call that replays it, or null. */
function firstFailure(checks: [boolean, string][], call: string) {
  const failed = checks.find(([holds]) => !holds);
  return failed ? `${failed[1]} fails for ${call}` : null;
}

function equalSplitProblem(
  amount: number,
  ids: readonly string[],
  payerId: string,
): string | null {
  const shares = splitEqual(amount, ids, payerId);
  const amounts = shares.map((share) => share.amount);
  const byMember = new Map(
    shares.map((share) => [share.memberId, share.amount]),
  );
  const payerShare = byMember.get(payerId);
  const others = ids
    .filter((id) => id !== payerId)
    .sort()
    .map((id) => byMember.get(id) ?? 0);
  const reordered = splitEqual(amount, [...ids].reverse(), payerId);
  return firstFailure(
    [
      [
        shares.every((share, i) => share.memberId === ids[i]),
        "shares come back in member order",
      ],
      [total(amounts) === amount, "shares add up to the amount"],
      [
        Math.max(...amounts) - Math.min(...amounts) <= 1,
        "shares are at most a cent apart",
      ],
      [
        payerShare === undefined || payerShare === Math.max(...amounts),
        "the payer gets the first odd cent",
      ],
      [
        others.every((share, i) => i === 0 || share <= others[i - 1]),
        "further odd cents go to lower IDs first",
      ],
      [
        reordered.every(
          (share) => share.amount === byMember.get(share.memberId),
        ),
        "member order doesn't change the shares",
      ],
    ],
    `splitEqual(${amount}, ${JSON.stringify(ids)}, ${JSON.stringify(payerId)})`,
  );
}

/** Zero-sum balances with some zeros and plenty of ties and exact matches. */
function randomBalances(random: Random, count: number): Balance[] {
  const ids = random.memberIds(count);
  const amounts = ids.slice(1).map(() => {
    if (random.int(0, 4) === 0) {
      return 0;
    }
    const size = random.int(0, 1) ? random.int(1, 6) * 500 : random.amount(9);
    return random.int(0, 1) ? size : -size;
  });
  amounts.push(-total(amounts));
  return ids.map((memberId, i) => ({ memberId, amount: amounts[i] }));
}

function isBefore(a: Transfer, b: Transfer): boolean {
  return a.from < b.from || (a.from === b.from && a.to < b.to);
}

function simplifyProblem(balances: readonly Balance[]): string | null {
  const transfers = simplifyDebts(balances);
  const start = new Map(
    balances.map((balance) => [balance.memberId, balance.amount]),
  );
  const left = new Map(start);
  for (const { from, to, amount } of transfers) {
    left.set(from, (left.get(from) ?? Number.NaN) + amount);
    left.set(to, (left.get(to) ?? Number.NaN) - amount);
  }
  const nonzero = balances.filter((balance) => balance.amount !== 0).length;
  return firstFailure(
    [
      [
        [...left.values()].every((amount) => amount === 0),
        "everyone ends at zero",
      ],
      [transfers.length <= Math.max(nonzero - 1, 0), "at most n - 1 payments"],
      [
        transfers.every(
          ({ amount }) => Number.isSafeInteger(amount) && amount > 0,
        ),
        "every payment is a positive whole amount",
      ],
      [
        transfers.every(
          ({ from, to }) =>
            (start.get(from) ?? 0) < 0 && (start.get(to) ?? 0) > 0,
        ),
        "only members who owe pay and only members owed receive",
      ],
      [
        transfers.every(
          (transfer, i) => i === 0 || isBefore(transfers[i - 1], transfer),
        ),
        "payments are sorted by payer, then payee",
      ],
      [
        JSON.stringify(simplifyDebts([...balances].reverse())) ===
          JSON.stringify(transfers),
        "input order doesn't change the payments",
      ],
    ],
    `simplifyDebts(${JSON.stringify(balances)})`,
  );
}

describe("CURRENCIES", () => {
  it("uses each currency's ISO 4217 minor-unit exponent", () => {
    expect(
      Object.fromEntries(
        Object.entries(CURRENCIES).map(([code, { exponent }]) => [
          code,
          exponent,
        ]),
      ),
    ).toEqual({ USD: 2, EUR: 2, GBP: 2, CAD: 2, MXN: 2, JPY: 0 });
  });
});

describe("isCurrencyCode", () => {
  it("accepts every supported code", () => {
    for (const code of Object.keys(CURRENCIES)) {
      expect(isCurrencyCode(code)).toBe(true);
    }
  });

  it.each(["usd", "XYZ", "", "toString", "__proto__", null, undefined, 42])(
    "rejects %j",
    (value) => {
      expect(isCurrencyCode(value)).toBe(false);
    },
  );
});

describe("splitEqual", () => {
  it("gives the payer the odd cent (UAT S4 step 1)", () => {
    expect(splitEqual(10_000, ["a", "b", "c"], "a")).toEqual([
      { memberId: "a", amount: 3_334 },
      { memberId: "b", amount: 3_333 },
      { memberId: "c", amount: 3_333 },
    ]);
  });

  it("gives the same shares in any member order (S4 step 2)", () => {
    expect(splitEqual(10_000, ["c", "a", "b"], "a")).toEqual([
      { memberId: "c", amount: 3_333 },
      { memberId: "a", amount: 3_334 },
      { memberId: "b", amount: 3_333 },
    ]);
  });

  it("hands further odd cents out by ascending member ID (S4-N2)", () => {
    expect(splitEqual(2, ["c", "b", "a"], "a")).toEqual([
      { memberId: "c", amount: 0 },
      { memberId: "b", amount: 1 },
      { memberId: "a", amount: 1 },
    ]);
    expect(splitEqual(2, ["a", "b", "c"], "c")).toEqual([
      { memberId: "a", amount: 1 },
      { memberId: "b", amount: 0 },
      { memberId: "c", amount: 1 },
    ]);
  });

  it("uses member ID order alone when the payer isn't in the split", () => {
    expect(splitEqual(101, ["c", "b"], "a")).toEqual([
      { memberId: "c", amount: 50 },
      { memberId: "b", amount: 51 },
    ]);
  });

  it("compares IDs by code unit, the order Postgres gives lowercase UUIDs", () => {
    // "B" (U+0042) comes before "a" (U+0061); a locale-aware sort disagrees.
    expect(splitEqual(1, ["a", "B"], "x")).toEqual([
      { memberId: "a", amount: 0 },
      { memberId: "B", amount: 1 },
    ]);
  });

  it("splits evenly when nothing is left over (S4 step 7)", () => {
    expect(
      splitEqual(12_000, ["a", "b", "c"], "b").map((share) => share.amount),
    ).toEqual([4_000, 4_000, 4_000]);
  });

  it("follows the rule for every amount to $20.00 and 1-12 members", () => {
    const random = seededRandom(2_000);
    const problems: string[] = [];
    for (let count = 1; count <= 12; count++) {
      const ids = random.memberIds(count);
      for (let amount = 1; amount <= 2_000; amount++) {
        // Each member takes a turn as payer, and so does someone outside it.
        const payerId = ids[amount % (count + 1)] ?? "outsider";
        const problem = equalSplitProblem(amount, ids, payerId);
        if (problem) {
          problems.push(problem);
        }
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  it("holds for 2,000 random amounts up to the cap and 1-25 members", () => {
    const random = seededRandom(2_026);
    const problems: string[] = [];
    for (let i = 0; i < 2_000; i++) {
      const ids = random.memberIds(random.int(1, 25));
      const payerId = ids[random.int(0, ids.length)] ?? "outsider";
      const problem = equalSplitProblem(random.amount(), ids, payerId);
      if (problem) {
        problems.push(problem);
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  it.each([
    0,
    -100,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    MAX_AMOUNT_MINOR + 1,
  ])("refuses an amount of %d", (amount) => {
    expect(() => splitEqual(amount, ["a", "b"], "a")).toThrow(RangeError);
  });

  it("refuses an empty or repeated member list", () => {
    expect(() => splitEqual(100, [], "a")).toThrow(RangeError);
    expect(() => splitEqual(100, ["a", "b", "a"], "a")).toThrow(RangeError);
  });
});

describe("checkExactSplit", () => {
  const split = (a: number, b: number, c: number) => [
    { memberId: "a", amount: a },
    { memberId: "b", amount: b },
    { memberId: "c", amount: c },
  ];

  it("says how much is still unassigned (UAT S4 step 4)", () => {
    expect(checkExactSplit(9_000, split(3_000, 3_000, 2_000))).toEqual({
      ok: false,
      error: "unassigned",
      difference: 1_000,
    });
  });

  it("says how much is over (S4 step 5)", () => {
    expect(checkExactSplit(9_000, split(3_000, 3_000, 4_000))).toEqual({
      ok: false,
      error: "over",
      difference: 1_000,
    });
  });

  it("accepts shares that add up exactly, zero shares included (S4 step 6)", () => {
    expect(checkExactSplit(9_000, split(3_000, 3_000, 3_000))).toEqual({
      ok: true,
    });
    expect(checkExactSplit(1_200, split(200, 1_000, 0))).toEqual({ ok: true });
  });

  it("accepts every equal split: 500 random cases", () => {
    const random = seededRandom(500);
    for (let i = 0; i < 500; i++) {
      const ids = random.memberIds(random.int(1, 25));
      const amount = random.amount();
      expect(
        checkExactSplit(amount, splitEqual(amount, ids, ids[0])),
        `amount ${amount}, ${ids.length} members`,
      ).toEqual({ ok: true });
    }
  });

  it.each([-1, 1.5, MAX_AMOUNT_MINOR + 1])(
    "refuses a share of %d",
    (amount) => {
      expect(() =>
        checkExactSplit(9_000, split(3_000, 3_000, amount)),
      ).toThrow(RangeError);
    },
  );

  it("refuses a bad amount, no shares or a repeated member", () => {
    expect(() => checkExactSplit(0, split(0, 0, 0))).toThrow(RangeError);
    expect(() => checkExactSplit(100, [])).toThrow(RangeError);
    expect(() =>
      checkExactSplit(100, [
        { memberId: "a", amount: 50 },
        { memberId: "a", amount: 50 },
      ]),
    ).toThrow(RangeError);
  });
});

describe("simplifyDebts", () => {
  it("settles the UAT S5 fixture in two payments", () => {
    expect(
      simplifyDebts([
        { memberId: "a", amount: 4_800 },
        { memberId: "b", amount: -1_400 },
        { memberId: "c", amount: -3_400 },
      ]),
    ).toEqual([
      { from: "b", to: "a", amount: 1_400 },
      { from: "c", to: "a", amount: 3_400 },
    ]);
  });

  it("suggests nothing when everyone is settled", () => {
    expect(simplifyDebts([])).toEqual([]);
    expect(
      simplifyDebts([
        { memberId: "a", amount: 0 },
        { memberId: "b", amount: 0 },
      ]),
    ).toEqual([]);
  });

  it("has exact matches pay each other directly", () => {
    // Largest-first on its own would take four payments here.
    expect(
      simplifyDebts([
        { memberId: "a", amount: 1_000 },
        { memberId: "b", amount: 700 },
        { memberId: "c", amount: -700 },
        { memberId: "d", amount: -600 },
        { memberId: "e", amount: -400 },
      ]),
    ).toEqual([
      { from: "c", to: "b", amount: 700 },
      { from: "d", to: "a", amount: 600 },
      { from: "e", to: "a", amount: 400 },
    ]);
  });

  it("breaks ties by member ID, whatever the input order", () => {
    const balances: Balance[] = [
      { memberId: "a", amount: 300 },
      { memberId: "b", amount: 300 },
      { memberId: "c", amount: -200 },
      { memberId: "d", amount: -200 },
      { memberId: "e", amount: -200 },
    ];
    const payments = [
      { from: "c", to: "a", amount: 200 },
      { from: "d", to: "b", amount: 200 },
      { from: "e", to: "a", amount: 100 },
      { from: "e", to: "b", amount: 100 },
    ];
    expect(simplifyDebts(balances)).toEqual(payments);
    expect(simplifyDebts([...balances].reverse())).toEqual(payments);
  });

  it("leaves its input alone", () => {
    const balances = [
      Object.freeze({ memberId: "a", amount: 500 }),
      Object.freeze({ memberId: "b", amount: -500 }),
    ];
    expect(simplifyDebts(balances)).toEqual([
      { from: "b", to: "a", amount: 500 },
    ]);
    expect(balances).toEqual([
      { memberId: "a", amount: 500 },
      { memberId: "b", amount: -500 },
    ]);
  });

  it("settles 2,000 random trips of 1-25 members in at most n - 1 payments", () => {
    const random = seededRandom(4_800);
    const problems: string[] = [];
    for (let i = 0; i < 2_000; i++) {
      const problem = simplifyProblem(
        randomBalances(random, random.int(1, 25)),
      );
      if (problem) {
        problems.push(problem);
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  it.each<[string, Balance[]]>([
    [
      "balances that don't sum to zero",
      [
        { memberId: "a", amount: 500 },
        { memberId: "b", amount: -400 },
      ],
    ],
    [
      "a fraction of a cent",
      [
        { memberId: "a", amount: 0.5 },
        { memberId: "b", amount: -0.5 },
      ],
    ],
    [
      "a member listed twice",
      [
        { memberId: "a", amount: 500 },
        { memberId: "a", amount: -500 },
      ],
    ],
  ])("refuses %s", (_case, balances) => {
    expect(() => simplifyDebts(balances)).toThrow(RangeError);
  });
});

describe("parseMoney", () => {
  it.each<[string, CurrencyCode, number]>([
    ["12", "USD", 1_200],
    ["12.5", "USD", 1_250],
    ["12.34", "USD", 1_234],
    [".5", "USD", 50],
    ["12.", "USD", 1_200],
    ["0.01", "USD", 1],
    ["0", "USD", 0],
    ["0.00", "USD", 0],
    ["007.50", "USD", 750],
    ["1,234.56", "USD", 123_456],
    ["1,000,000.00", "USD", 100_000_000],
    ["999,999,999.99", "USD", MAX_AMOUNT_MINOR],
    ["  42.00 ", "EUR", 4_200],
    ["1,235", "JPY", 1_235],
    ["1235.", "JPY", 1_235],
  ])("reads %j in %s as %d", (input, currency, amount) => {
    expect(parseMoney(input, currency)).toEqual({ ok: true, amount });
  });

  it.each<[string, CurrencyCode, string]>([
    ["", "USD", "empty"],
    ["   ", "USD", "empty"],
    ["abc", "USD", "invalid"],
    ["12abc", "USD", "invalid"],
    ["-5", "USD", "invalid"],
    ["+5", "USD", "invalid"],
    ["1e3", "USD", "invalid"],
    ["$12", "USD", "invalid"],
    ["12,50", "USD", "invalid"],
    ["1,2345", "USD", "invalid"],
    ["1234,567", "USD", "invalid"],
    [",123", "USD", "invalid"],
    [".", "USD", "invalid"],
    ["1.2.3", "USD", "invalid"],
    ["12 345", "USD", "invalid"],
    ["Infinity", "USD", "invalid"],
    ["0x10", "USD", "invalid"],
    ["１２", "USD", "invalid"],
    ["12.345", "USD", "too_many_decimals"],
    ["12.340", "USD", "too_many_decimals"],
    ["12.5", "JPY", "too_many_decimals"],
    ["12.0", "JPY", "too_many_decimals"],
    ["1,000,000,000.00", "USD", "too_large"],
    ["99999999999999999999", "USD", "too_large"],
  ])(
    "refuses %j in %s as %s, never rounding (UAT S4-N1)",
    (input, currency, error) => {
      expect(parseMoney(input, currency)).toEqual({ ok: false, error });
    },
  );

  it("reads back what toMoneyInput and formatMoney write: 2,000 amounts per currency", () => {
    const random = seededRandom(1_234);
    const problems: string[] = [];
    for (const currency of Object.keys(CURRENCIES) as CurrencyCode[]) {
      const { symbol } = CURRENCIES[currency];
      for (let i = 0; i < 2_000; i++) {
        const amount = random.int(0, 1) ? random.amount() : random.int(0, 999);
        const texts = [
          toMoneyInput(amount, currency),
          formatMoney(amount, currency).slice(symbol.length),
        ];
        for (const text of texts) {
          const result = parseMoney(text, currency);
          if (!result.ok || result.amount !== amount) {
            problems.push(
              `${amount} ${currency} -> ${JSON.stringify(text)} -> ${JSON.stringify(result)}`,
            );
          }
        }
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  it("refuses an unsupported currency", () => {
    expect(() => parseMoney("12", "XYZ" as CurrencyCode)).toThrow(RangeError);
  });
});

describe("formatMoney", () => {
  it.each<[number, CurrencyCode, string]>([
    [0, "USD", "$0.00"],
    [1, "USD", "$0.01"],
    [3_333, "USD", "$33.33"],
    [10_000, "USD", "$100.00"],
    [100_000_000, "USD", "$1,000,000.00"],
    [MAX_AMOUNT_MINOR, "USD", "$999,999,999.99"],
    [-1_400, "USD", `${MINUS}$14.00`],
    [1_250, "EUR", "€12.50"],
    [1_250, "GBP", "£12.50"],
    [1_250, "CAD", "CA$12.50"],
    [1_250, "MXN", "MX$12.50"],
    [1_235, "JPY", "¥1,235"],
    [0, "JPY", "¥0"],
    [-1_235, "JPY", `${MINUS}¥1,235`],
  ])("shows %d %s as %s", (amount, currency, text) => {
    expect(formatMoney(amount, currency)).toBe(text);
  });

  it("signs both directions for balances with exceptZero (UAT S5 fixture)", () => {
    const balance = (amount: number) =>
      formatMoney(amount, "USD", { signDisplay: "exceptZero" });
    expect(balance(4_800)).toBe("+$48.00");
    expect(balance(-3_400)).toBe(`${MINUS}$34.00`);
    expect(balance(0)).toBe("$0.00");
  });

  it("never shows a negative zero", () => {
    expect(formatMoney(-0, "USD")).toBe("$0.00");
  });

  it("always shows two decimals and only the amount's digits (S4-N4): 2,000 random amounts", () => {
    const random = seededRandom(3_333);
    const shape = /^−?\$[0-9]{1,3}(?:,[0-9]{3})*\.[0-9]{2}$/;
    const problems: string[] = [];
    for (let i = 0; i < 2_000; i++) {
      const amount = random.amount() * (random.int(0, 1) ? 1 : -1);
      const text = formatMoney(amount, "USD");
      const digits = String(Math.abs(amount)).padStart(3, "0");
      if (!shape.test(text) || text.replace(/[^0-9]/g, "") !== digits) {
        problems.push(`${amount} -> ${text}`);
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses %d",
    (amount) => {
      expect(() => formatMoney(amount, "USD")).toThrow(RangeError);
    },
  );
});

describe("toMoneyInput", () => {
  it.each<[number, CurrencyCode, string]>([
    [123_456, "USD", "1234.56"],
    [5, "USD", "0.05"],
    [0, "USD", "0.00"],
    [1_235, "JPY", "1235"],
  ])("writes %d %s as %j", (amount, currency, text) => {
    expect(toMoneyInput(amount, currency)).toBe(text);
  });

  it.each([-1, 1.5])("refuses %d", (amount) => {
    expect(() => toMoneyInput(amount, "USD")).toThrow(RangeError);
  });
});
