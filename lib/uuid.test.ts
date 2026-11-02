import { describe, expect, it } from "vitest";

import { isUuid } from "@/lib/uuid";

describe("isUuid", () => {
  it("accepts canonical UUIDs in either case", () => {
    expect(isUuid("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isUuid("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA")).toBe(true);
  });

  it.each([null, undefined, 42, "", "not-a-uuid", "11111111-1111-4111-8111-11111111111", "(id,eq.1)"])(
    "rejects %j",
    (value) => {
      expect(isUuid(value)).toBe(false);
    },
  );
});
