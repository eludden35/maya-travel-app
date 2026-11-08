import { describe, expect, it } from "vitest";

import { MAX_AMOUNT_MINOR, simplifyDebts } from "@/lib/money";
import {
  settlementInputError,
  toSettlement,
  toTripBalance,
} from "@/lib/settlements";

const A = "10000000-0000-4000-8000-000000000001";
const B = "20000000-0000-4000-8000-000000000002";
const C = "30000000-0000-4000-8000-000000000003";

describe("settlementInputError", () => {
  it("accepts two members and a whole amount", () => {
    expect(
      settlementInputError({ fromId: B, toId: A, amount: 1_400 }),
    ).toBeNull();
  });

  it("leaves the amount's range to the RPC, so it reports one error for it", () => {
    // Zero, negative and over-the-limit amounts are whole numbers; the RPC
    // refuses them with the same status, before any charge.
    for (const amount of [0, -100, MAX_AMOUNT_MINOR + 1]) {
      expect(settlementInputError({ fromId: B, toId: A, amount })).toBeNull();
    }
  });

  it("refuses fractions of a cent and non-numbers", () => {
    for (const amount of [10.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(settlementInputError({ fromId: B, toId: A, amount })).toBe(
        "invalid_amount",
      );
    }
  });

  it("refuses an id that can't be a member", () => {
    expect(
      settlementInputError({ fromId: "bob", toId: A, amount: 100 }),
    ).toBe("not_a_member");
    expect(
      settlementInputError({ fromId: B, toId: "", amount: 100 }),
    ).toBe("not_a_member");
  });

  it("refuses paying yourself", () => {
    expect(settlementInputError({ fromId: A, toId: A, amount: 100 })).toBe(
      "same_member",
    );
  });
});

describe("toSettlement", () => {
  it("maps a void, keeping which settlement it reverses", () => {
    expect(
      toSettlement({
        id: "v",
        trip_id: "t",
        from_id: A,
        to_id: B,
        amount: 1_400,
        reverses_id: "s",
        created_by: A,
        created_at: "2026-11-08T12:00:00+00:00",
      }),
    ).toEqual({
      id: "v",
      tripId: "t",
      fromId: A,
      toId: B,
      amount: 1_400,
      reversesId: "s",
      createdBy: A,
      createdAt: "2026-11-08T12:00:00+00:00",
    });
  });
});

describe("toTripBalance", () => {
  it("gives simplifyDebts the shape it takes (test plan S5 step 2)", () => {
    const balances = [
      { member_id: A, net: 4_800, is_member: true },
      { member_id: B, net: -1_400, is_member: true },
      { member_id: C, net: -3_400, is_member: true },
    ].map(toTripBalance);

    expect(balances[1]).toEqual({
      memberId: B,
      amount: -1_400,
      isMember: true,
    });
    expect(simplifyDebts(balances)).toEqual([
      { from: B, to: A, amount: 1_400 },
      { from: C, to: A, amount: 3_400 },
    ]);
  });
});
