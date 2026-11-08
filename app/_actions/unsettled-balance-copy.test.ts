import { describe, expect, it } from "vitest";

import {
  deleteBlockedCopy,
  leaveBlockedCopy,
  removeBlockedCopy,
} from "@/app/_actions/unsettled-balance-copy";

describe("leaveBlockedCopy", () => {
  it("says what the member owes (test plan S7 step 1)", () => {
    expect(leaveBlockedCopy({ amount: -3_400, currency: "USD" })).toBe(
      "You owe $34.00 on this trip. Settle up and mark it as paid, then you can leave.",
    );
  });

  it("says what the member is owed", () => {
    expect(leaveBlockedCopy({ amount: 1_600, currency: "EUR" })).toBe(
      "You're owed €16.00 on this trip. Once you're paid back and it's marked as paid, you can leave.",
    );
  });

  it("falls back to plain words without the numbers", () => {
    const plain =
      "Your balance on this trip isn't settled yet. Settle up and mark it as paid, then you can leave.";
    expect(leaveBlockedCopy(null)).toBe(plain);
    expect(leaveBlockedCopy({ amount: 0, currency: "USD" })).toBe(plain);
  });
});

describe("removeBlockedCopy", () => {
  it("names the member and what they owe (test plan S7 step 2)", () => {
    expect(removeBlockedCopy("Bob", { amount: -1_400, currency: "USD" })).toBe(
      "Bob owes $14.00 on this trip. Once they've settled up and it's marked as paid, you can remove them.",
    );
  });

  it("says what the member is owed", () => {
    expect(removeBlockedCopy("Bob", { amount: 500, currency: "GBP" })).toBe(
      "Bob is owed £5.00 on this trip. Once they're paid back and it's marked as paid, you can remove them.",
    );
  });

  it("works without the name or the numbers", () => {
    expect(removeBlockedCopy(null, null)).toBe(
      "This member's balance on this trip isn't settled yet. Once it is, you can remove them.",
    );
    expect(removeBlockedCopy("Bob", null)).toBe(
      "Bob's balance on this trip isn't settled yet. Once it is, you can remove them.",
    );
  });
});

describe("deleteBlockedCopy", () => {
  const next =
    "Once every balance is settled and marked as paid, you can delete the trip.";
  const alice = { name: "Alice", isViewer: true, amount: 4_800 };
  const bob = { name: "Bob", isViewer: false, amount: -1_400 };
  const carol = { name: "Carol", isViewer: false, amount: -3_400 };

  it("names one person", () => {
    expect(deleteBlockedCopy([bob], "USD")).toBe(
      `Not everyone is settled up yet: Bob owes $14.00. ${next}`,
    );
  });

  it("names two people", () => {
    expect(deleteBlockedCopy([bob, carol], "USD")).toBe(
      `Not everyone is settled up yet: Bob owes $14.00 and Carol owes $34.00. ${next}`,
    );
  });

  it("calls the organizer you, and lists three people (test plan S7-N4)", () => {
    expect(deleteBlockedCopy([alice, bob, carol], "USD")).toBe(
      `Not everyone is settled up yet: you're owed $48.00, Bob owes $14.00, and Carol owes $34.00. ${next}`,
    );
  });

  it("says when the organizer is the one who owes", () => {
    expect(
      deleteBlockedCopy([{ ...alice, amount: -100 }], "USD"),
    ).toBe(`Not everyone is settled up yet: you owe $1.00. ${next}`);
  });

  it("says someone is owed", () => {
    expect(deleteBlockedCopy([{ ...bob, amount: 100 }], "USD")).toBe(
      `Not everyone is settled up yet: Bob is owed $1.00. ${next}`,
    );
  });

  it("counts a longer list instead of naming it", () => {
    const dan = { name: "Dan", isViewer: false, amount: -1 };
    expect(deleteBlockedCopy([alice, bob, carol, dan], "USD")).toBe(
      `4 people on this trip still have balances to settle. ${next}`,
    );
  });

  it("falls back to plain words without the numbers", () => {
    const plain = `Not everyone on this trip is settled up yet. ${next}`;
    expect(deleteBlockedCopy(null, "USD")).toBe(plain);
    expect(deleteBlockedCopy([bob], null)).toBe(plain);
    expect(deleteBlockedCopy([], "USD")).toBe(plain);
  });
});
