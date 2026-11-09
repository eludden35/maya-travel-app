import { describe, expect, it } from "vitest";

import {
  amountProblem,
  readExpenseForm,
  readPaymentForm,
} from "@/lib/expense-fields";
import { parseMoney } from "@/lib/money";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  entries.forEach(([key, value]) => data.append(key, value));
  return data;
}

const base: [string, string][] = [
  ["description", "Dinner"],
  ["amount", "90.00"],
  ["payer_id", A],
];

describe("amountProblem", () => {
  const problem = (text: string) => amountProblem(parseMoney(text, "USD"), "USD");

  it("refuses what S4-N1 lists, and never rounds", () => {
    expect(problem("0")).toBe("Enter an amount above zero.");
    expect(problem("-5")).toBe("Use digits only, like 24.50.");
    expect(problem("12.345")).toBe("Two decimals at most, like 12.34.");
    expect(problem("abc")).toBe("Use digits only, like 24.50.");
    expect(problem("")).toBe("Enter an amount, like 24.50.");
  });

  it("states the cap (S4-N3)", () => {
    expect(problem("1,000,000,000")).toBe("The most it can be is $999,999,999.99.");
    expect(problem("1000000.00")).toBeNull();
  });
});

describe("readExpenseForm", () => {
  it("reads an equal split", () => {
    const read = readExpenseForm(
      form([...base, ["split", "equal"], ["member", A], ["member", B]]),
      "USD",
    );
    expect(read).toEqual({
      ok: true,
      input: {
        payerId: A,
        description: "Dinner",
        amount: 9_000,
        split: "equal",
        memberIds: [A, B],
      },
    });
  });

  it("needs someone in an equal split", () => {
    expect(readExpenseForm(form([...base, ["split", "equal"]]), "USD")).toMatchObject({
      ok: false,
      field: "split",
    });
  });

  it("reads an exact split and leaves out blanks, keeping a typed zero", () => {
    const read = readExpenseForm(
      form([
        ...base,
        ["split", "exact"],
        [`share_${A}`, "90"],
        [`share_${B}`, "0"],
        ["share_other", " "],
      ]),
      "USD",
    );
    expect(read).toMatchObject({
      ok: true,
      input: {
        split: "exact",
        shares: [
          { memberId: A, amount: 9_000 },
          { memberId: B, amount: 0 },
        ],
      },
    });
  });

  it("refuses an exact split that doesn't add up, naming the gap (S4 steps 4-5)", () => {
    const short = form([...base, ["split", "exact"], [`share_${A}`, "80"]]);
    expect(readExpenseForm(short, "USD")).toEqual({
      ok: false,
      field: "split",
      message: "$10.00 still unassigned. Shares have to add up to $90.00.",
    });
    const over = form([...base, ["split", "exact"], [`share_${A}`, "100"]]);
    expect(readExpenseForm(over, "USD")).toMatchObject({
      message: "$10.00 over. Shares have to add up to $90.00.",
    });
  });

  it("refuses a share that isn't an amount", () => {
    expect(
      readExpenseForm(form([...base, ["split", "exact"], [`share_${A}`, "ten"]]), "USD"),
    ).toMatchObject({ ok: false, field: "split" });
  });

  it("asks for a description", () => {
    expect(
      readExpenseForm(form([["description", "  "], ["amount", "1"]]), "USD"),
    ).toMatchObject({ ok: false, field: "description" });
    expect(
      readExpenseForm(form([["description", "x".repeat(121)], ["amount", "1"]]), "USD"),
    ).toMatchObject({ ok: false, field: "description" });
  });
});

describe("readPaymentForm", () => {
  it("reads who paid whom and how much, partial amounts included", () => {
    expect(
      readPaymentForm(
        form([["from_id", A], ["to_id", B], ["amount", "0.01"]]),
        "USD",
      ),
    ).toEqual({ ok: true, fromId: A, toId: B, amount: 1 });
  });

  it("asks for the other person and a real amount", () => {
    expect(
      readPaymentForm(form([["from_id", A], ["to_id", ""], ["amount", "1"]]), "USD"),
    ).toMatchObject({ ok: false, field: "person" });
    expect(
      readPaymentForm(form([["from_id", A], ["to_id", B], ["amount", "0"]]), "USD"),
    ).toMatchObject({ ok: false, field: "amount" });
  });
});
