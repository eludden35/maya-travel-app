import { afterEach, describe, expect, it, vi } from "vitest";

import { toFailure, toResult } from "@/lib/rpc-result";

const KNOWN = ["not_found", "forbidden"] as const;

describe("toResult", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is ok for an ok status", () => {
    expect(toResult("op", "ok", null, KNOWN)).toEqual({ ok: true });
  });

  it("passes a status the caller knows through", () => {
    expect(toResult("op", "forbidden", null, KNOWN)).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("turns a status it doesn't know into unknown, and logs it", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(toResult("op", "member_left", null, KNOWN)).toEqual({
      ok: false,
      error: "unknown",
    });
    expect(log).toHaveBeenCalledWith(
      "op returned an unexpected status",
      "member_left",
    );
  });

  it("turns a transport error into unknown, whatever the status", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = { code: "42501", message: "permission denied" };
    expect(toResult("op", "ok", error, KNOWN)).toEqual({
      ok: false,
      error: "unknown",
    });
    expect(toFailure("op", null, error, KNOWN)).toEqual({
      ok: false,
      error: "unknown",
    });
    expect(log).toHaveBeenCalledWith("op failed", "42501", "permission denied");
  });
});
