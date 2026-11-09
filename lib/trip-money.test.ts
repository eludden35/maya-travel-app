import { describe, expect, it } from "vitest";

import type { Settlement, TripBalance } from "@/lib/settlements";
import {
  balanceWord,
  exactSplitLine,
  expenseAccess,
  leftoverLine,
  ledgerName,
  listOf,
  paymentHistory,
  paymentLine,
  peopleFrom,
  previewEqualSplit,
  sentenceName,
  suggestedPayments,
  viewerStanding,
} from "@/lib/trip-money";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const GONE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const members = [
  { profile_id: A, display_name: "Alice" },
  { profile_id: B, display_name: "Ben" },
];
const memberIds = new Set([A, B, C]);
const people = peopleFrom(members, [{ profile_id: C, display_name: "Cleo" }], A);

describe("names in the ledger", () => {
  it("reads the viewer as You and marks someone who left", () => {
    expect(ledgerName(people(A))).toBe("You");
    expect(ledgerName(people(B))).toBe("Ben");
    expect(ledgerName(people(C))).toBe("Cleo (left)");
  });

  it("lowercases the viewer mid-sentence", () => {
    expect(sentenceName(people(A))).toBe("you");
    expect(sentenceName(people(C))).toBe("Cleo (left)");
  });

  it("never shows a raw id", () => {
    expect(ledgerName(people(GONE))).toBe("Someone who left");
  });

  it("prefers the current member when someone left and came back", () => {
    const rejoined = peopleFrom(
      [{ profile_id: C, display_name: "Cleo" }],
      [{ profile_id: C, display_name: "Cleo" }],
      A,
    );
    expect(ledgerName(rejoined(C))).toBe("Cleo");
  });

  it("writes payment lines from the viewer's side", () => {
    expect(paymentLine(people(A), people(B), "pays")).toBe("You pay Ben");
    expect(paymentLine(people(B), people(A), "pays")).toBe("Ben pays you");
    expect(paymentLine(people(B), people(C), "paid")).toBe("Ben paid Cleo (left)");
    expect(paymentLine(people(A), people(B), "paid")).toBe("You paid Ben");
  });

  it("agrees the balance word with the name beside it", () => {
    expect(balanceWord(100, false)).toBe("is owed");
    expect(balanceWord(100, true)).toBe("are owed");
    expect(balanceWord(-100, false)).toBe("owes");
    expect(balanceWord(-100, true)).toBe("owe");
    expect(balanceWord(0, true)).toBe("all square");
  });

  it("joins names", () => {
    expect(listOf(["A"])).toBe("A");
    expect(listOf(["A", "B"])).toBe("A and B");
    expect(listOf(["A", "B", "C"])).toBe("A, B and C");
  });
});

describe("viewerStanding", () => {
  const balances = [
    { memberId: A, amount: 4800 },
    { memberId: B, amount: -1400 },
    { memberId: C, amount: -3400 },
  ];
  const transfers = [
    { from: B, to: A, amount: 1400 },
    { from: C, to: A, amount: 3400 },
  ];

  it("is empty before the first cost", () => {
    expect(viewerStanding([{ memberId: A, amount: 0 }], [], A, 0)).toEqual({
      kind: "empty",
    });
  });

  it("isn't empty when a payment outlives the costs it paid for", () => {
    const afterDelete = [
      { memberId: A, amount: -1400 },
      { memberId: B, amount: 1400 },
    ];
    expect(
      viewerStanding(afterDelete, [{ from: A, to: B, amount: 1400 }], A, 0),
    ).toEqual({ kind: "owes", amount: 1400, counterparts: [B] });
    expect(
      viewerStanding(afterDelete, [{ from: A, to: B, amount: 1400 }], B, 0),
    ).toEqual({ kind: "owed", amount: 1400, counterparts: [A] });
  });

  it("is empty when voided payments leave no costs and no balances", () => {
    expect(
      viewerStanding(
        [
          { memberId: A, amount: 0 },
          { memberId: B, amount: 0 },
        ],
        [],
        A,
        0,
      ),
    ).toEqual({ kind: "empty" });
  });

  it("says what the viewer is owed and by whom (S5 step 1)", () => {
    expect(viewerStanding(balances, transfers, A, 3)).toEqual({
      kind: "owed",
      amount: 4800,
      counterparts: [B, C],
    });
  });

  it("says what the viewer owes and to whom", () => {
    expect(viewerStanding(balances, transfers, B, 3)).toEqual({
      kind: "owes",
      amount: 1400,
      counterparts: [A],
    });
  });

  it("tells square from settled", () => {
    const partly = [
      { memberId: A, amount: 3400 },
      { memberId: B, amount: 0 },
      { memberId: C, amount: -3400 },
    ];
    expect(viewerStanding(partly, [], B, 3)).toEqual({ kind: "square" });
    expect(
      viewerStanding(
        [
          { memberId: A, amount: 0 },
          { memberId: B, amount: 0 },
        ],
        [],
        A,
        3,
      ),
    ).toEqual({ kind: "settled" });
  });
});

describe("suggestedPayments", () => {
  const balances: TripBalance[] = [
    { memberId: A, amount: 4800, isMember: true },
    { memberId: B, amount: -1400, isMember: true },
    { memberId: C, amount: -3400, isMember: true },
  ];

  it("offers Mark as paid only to the two people in a payment", () => {
    const payments = suggestedPayments(balances, B);
    expect(payments.map((p) => [p.from, p.to, p.amount, p.canMark])).toEqual([
      [B, A, 1400, true],
      [C, A, 3400, false],
    ]);
  });

  it("puts the viewer's own payments first", () => {
    expect(suggestedPayments(balances, C)[0]).toMatchObject({ from: C, canMark: true });
  });

  it("won't offer a payment to someone who has left", () => {
    const [payment] = suggestedPayments(
      [
        { memberId: A, amount: 500, isMember: false },
        { memberId: B, amount: -500, isMember: true },
      ],
      B,
    );
    expect(payment).toMatchObject({ canMark: false, hasFormerMember: true });
  });
});

describe("expenseAccess", () => {
  const expense = {
    payerId: B,
    createdBy: C,
    shares: [
      { memberId: A, amount: 100 },
      { memberId: B, amount: 100 },
    ],
  };
  const viewing = (viewerId: string, ids: ReadonlySet<string> = memberIds) =>
    expenseAccess(expense, { viewerId, organizerId: A, memberIds: ids });

  it("lets the payer, the creator and the organizer change it (S4-N5)", () => {
    expect(viewing(B)).toBe("editable");
    expect(viewing(C)).toBe("editable");
    expect(viewing(A)).toBe("editable");
    expect(viewing(GONE)).toBe("none");
  });

  it("freezes it once someone on it has left (S7-N5)", () => {
    expect(viewing(A, new Set([A, C]))).toBe("frozen");
  });

  it("shows no reason to someone who could never change it", () => {
    expect(viewing(GONE, new Set([A, C]))).toBe("none");
  });
});

describe("paymentHistory", () => {
  const row = (
    id: string,
    fromId: string,
    toId: string,
    createdBy: string,
    reversesId: string | null = null,
  ): Settlement => ({
    id,
    tripId: "t",
    fromId,
    toId,
    amount: 1400,
    reversesId,
    createdBy,
    createdAt: `2026-11-08T10:00:0${id}Z`,
  });
  // Newest first, as listTripSettlements returns them: paid, voided, paid.
  const rows = [row("3", B, A, B), row("2", A, B, A, "1"), row("1", B, A, B)];

  it("shows a void on the payment it reverses, never as a payment (S5 step 7)", () => {
    const history = paymentHistory(rows, { viewerId: B, memberIds });
    expect(history.map((entry) => entry.id)).toEqual(["3", "1"]);
    expect(history[0].voided).toBeNull();
    expect(history[1].voided).toEqual({ by: A, at: "2026-11-08T10:00:02Z" });
  });

  it("offers Void once, to the two parties, while both are members", () => {
    const asParty = paymentHistory(rows, { viewerId: B, memberIds });
    expect(asParty.map((entry) => entry.canVoid)).toEqual([true, false]);
    const asOther = paymentHistory(rows, { viewerId: C, memberIds });
    expect(asOther.map((entry) => entry.canVoid)).toEqual([false, false]);
    const afterLeaving = paymentHistory(rows, {
      viewerId: B,
      memberIds: new Set([B]),
    });
    expect(afterLeaving.map((entry) => entry.canVoid)).toEqual([false, false]);
  });
});

describe("split previews", () => {
  it("shows where the odd cent went, payer first (S4 step 1)", () => {
    expect(previewEqualSplit(10_000, [A, B, C], A)).toEqual({
      shares: [
        { memberId: A, amount: 3334 },
        { memberId: B, amount: 3333 },
        { memberId: C, amount: 3333 },
      ],
      leftover: 1,
      extraIds: [A],
    });
  });

  it("lists two extras with the payer first (S4-N2)", () => {
    expect(previewEqualSplit(5, [A, B, C], C).extraIds).toEqual([C, A]);
  });

  it("has no leftover on an even split", () => {
    expect(previewEqualSplit(9_000, [A, B, C], B)).toMatchObject({
      leftover: 0,
      extraIds: [],
    });
  });

  it("says the leftover in words", () => {
    expect(leftoverLine(1, ["you"], "USD")).toBe(
      "$0.01 won't split evenly, so the extra goes to you.",
    );
    expect(leftoverLine(2, ["you", "Ben"], "EUR")).toBe(
      "€0.02 won't split evenly, so the extra goes to you and Ben.",
    );
  });

  it("says how an exact split stands (S4 steps 4-6)", () => {
    const shares = (a: number, b: number, c: number) => [
      { memberId: A, amount: a },
      { memberId: B, amount: b },
      { memberId: C, amount: c },
    ];
    expect(exactSplitLine(9_000, shares(3_000, 3_000, 2_000), "USD")).toEqual({
      ok: false,
      text: "$10.00 still unassigned.",
    });
    expect(exactSplitLine(9_000, shares(3_000, 3_000, 4_000), "USD")).toEqual({
      ok: false,
      text: "$10.00 over.",
    });
    expect(exactSplitLine(9_000, shares(3_000, 3_000, 3_000), "USD")).toEqual({
      ok: true,
      text: "Adds up to $90.00.",
    });
    expect(exactSplitLine(9_000, [], "USD")).toEqual({
      ok: false,
      text: "$90.00 still unassigned.",
    });
  });
});
