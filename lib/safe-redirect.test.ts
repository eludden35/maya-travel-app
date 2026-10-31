import { describe, expect, it } from "vitest";

import { safeNextPath } from "@/lib/safe-redirect";

describe("safeNextPath", () => {
  it("keeps same-origin paths with query and hash", () => {
    expect(safeNextPath("/")).toBe("/");
    expect(safeNextPath("/trips/123?tab=money#top")).toBe("/trips/123?tab=money#top");
  });

  it("falls back for empty input", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath(null, "/onboarding/handle")).toBe("/onboarding/handle");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "javascript:alert(1)",
    "evil.example/path",
  ])("refuses %j", (value) => {
    expect(safeNextPath(value)).toBe("/");
  });
});
