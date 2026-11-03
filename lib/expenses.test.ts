import { describe, expect, it } from "vitest";

import { expenseInputError, toExpense, type ExpenseInput } from "@/lib/expenses";
import { splitEqual } from "@/lib/money";

// The fixture in supabase/tests/database/011-expenses.test.sql, which runs it
// through private.equal_shares(). The server computes equal splits and a form
// previews them with splitEqual, so both must give these shares to the cent.
const P = "0f000000-0000-4000-8000-000000000000";
const Q = "0f000000-0000-4000-8000-000000000001";
const R = "10000000-0000-4000-8000-000000000000";
const S = "a0000000-0000-4000-8000-000000000000";
const T = "f0000000-0000-4000-8000-000000000001";

const EQUAL_SPLIT_FIXTURE = [
  {
    name: "fixture 1: 10 four ways, payer in the split",
    amount: 10,
    memberIds: [S, P, T, R],
    payerId: T,
    shares: { [P]: 3, [R]: 2, [S]: 2, [T]: 3 },
  },
  {
    name: "fixture 2: 10 three ways, payer outside the split",
    amount: 10,
    memberIds: [S, P, R],
    payerId: T,
    shares: { [P]: 4, [R]: 3, [S]: 3 },
  },
  {
    name: "fixture 3: 2 three ways, fewer cents than members",
    amount: 2,
    memberIds: [R, S, P],
    payerId: R,
    shares: { [P]: 1, [R]: 1, [S]: 0 },
  },
  {
    name: "fixture 4: ids that differ only in the last digit",
    amount: 3,
    memberIds: [Q, P],
    payerId: T,
    shares: { [P]: 2, [Q]: 1 },
  },
  {
    name: "fixture 5: the payer has the highest id and still takes the odd cent",
    amount: 10_000,
    memberIds: [S, P, R],
    payerId: S,
    shares: { [P]: 3333, [R]: 3333, [S]: 3334 },
  },
];

describe("splitEqual agrees with private.equal_shares", () => {
  it.each(EQUAL_SPLIT_FIXTURE)("$name", ({ amount, memberIds, payerId, shares }) => {
    const result = splitEqual(amount, memberIds, payerId);
    expect(
      Object.fromEntries(result.map((share) => [share.memberId, share.amount])),
    ).toEqual(shares);
  });
});

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

const equal = {
  payerId: ALICE,
  description: "Dinner",
  amount: 9000,
  split: "equal",
  memberIds: [ALICE, BOB],
} satisfies ExpenseInput;

const exact = {
  payerId: ALICE,
  description: "Dinner",
  amount: 9000,
  split: "exact",
  shares: [
    { memberId: ALICE, amount: 4000 },
    { memberId: BOB, amount: 5000 },
  ],
} satisfies ExpenseInput;

describe("expenseInputError", () => {
  it("passes well-formed input", () => {
    expect(expenseInputError(equal)).toBeNull();
    expect(expenseInputError(exact)).toBeNull();
    expect(expenseInputError({ ...equal, payerId: ALICE.toUpperCase() })).toBeNull();
  });

  it("leaves ranges, descriptions and sums to the RPC", () => {
    expect(expenseInputError({ ...equal, amount: 0, description: "" })).toBeNull();
    expect(
      expenseInputError({ ...exact, shares: [{ memberId: ALICE, amount: -1 }] }),
    ).toBeNull();
  });

  it.each([12.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    "refuses the amount %s",
    (amount) => {
      expect(expenseInputError({ ...equal, amount })).toBe("invalid_amount");
    },
  );

  it("refuses a fraction of a cent in an exact share", () => {
    expect(
      expenseInputError({
        ...exact,
        shares: [
          { memberId: ALICE, amount: 4000.5 },
          { memberId: BOB, amount: 4999.5 },
        ],
      }),
    ).toBe("invalid_shares");
  });

  it("refuses an unknown split method", () => {
    const percent = { ...equal, split: "percent" } as unknown as ExpenseInput;
    expect(expenseInputError(percent)).toBe("invalid_shares");
  });

  it("treats an id that isn't a UUID as someone outside the trip", () => {
    expect(expenseInputError({ ...equal, payerId: "alice" })).toBe("not_a_member");
    expect(expenseInputError({ ...equal, memberIds: [ALICE, "bob"] })).toBe(
      "not_a_member",
    );
    expect(
      expenseInputError({ ...exact, shares: [{ memberId: "", amount: 9000 }] }),
    ).toBe("not_a_member");
  });
});

describe("toExpense", () => {
  it("maps the row and orders the shares by member id", () => {
    expect(
      toExpense({
        id: "e1",
        trip_id: "t1",
        payer_id: BOB,
        description: "Taxi",
        amount: 1001,
        split: "equal",
        created_by: ALICE,
        created_at: "2026-11-03T10:00:00+00:00",
        updated_by: null,
        updated_at: "2026-11-03T10:00:00+00:00",
        expense_shares: [
          { member_id: BOB, amount: 500 },
          { member_id: ALICE, amount: 501 },
        ],
      }),
    ).toEqual({
      id: "e1",
      tripId: "t1",
      payerId: BOB,
      description: "Taxi",
      amount: 1001,
      split: "equal",
      shares: [
        { memberId: ALICE, amount: 501 },
        { memberId: BOB, amount: 500 },
      ],
      createdBy: ALICE,
      createdAt: "2026-11-03T10:00:00+00:00",
      updatedBy: null,
      updatedAt: "2026-11-03T10:00:00+00:00",
    });
  });
});
