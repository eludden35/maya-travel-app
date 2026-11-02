import { describe, expect, it, vi } from "vitest";

import { formatTripDates, formatTripLength } from "@/lib/trip-dates";

// Intl puts thin spaces around the range dash; compare with plain spaces.
const plain = (text: string) => text.replace(/\s/g, " ");

describe("formatTripDates", () => {
  it("shows a range within one month compactly", () => {
    expect(plain(formatTripDates("2026-12-04", "2026-12-07"))).toBe("Dec 4 – 7, 2026");
  });

  it("shows a range across years in full", () => {
    expect(plain(formatTripDates("2026-12-30", "2027-01-02"))).toBe(
      "Dec 30, 2026 – Jan 2, 2027",
    );
  });

  it("shows a one-day trip as one date", () => {
    expect(formatTripDates("2026-12-04", "2026-12-04")).toBe("Dec 4, 2026");
  });

  it("handles open-ended and undecided dates", () => {
    expect(formatTripDates("2026-12-04", null)).toBe("From Dec 4, 2026");
    expect(formatTripDates(null, "2026-12-07")).toBe("Until Dec 7, 2026");
    expect(formatTripDates(null, null)).toBe("Dates TBD");
  });

  it("keeps the calendar day west of UTC", async () => {
    // The formatter is built at import, so import a fresh copy in Chicago.
    const zone = process.env.TZ;
    process.env.TZ = "America/Chicago";
    try {
      vi.resetModules();
      const fresh = await import("@/lib/trip-dates");
      expect(fresh.formatTripDates("2026-12-04", null)).toBe("From Dec 4, 2026");
    } finally {
      if (zone === undefined) delete process.env.TZ;
      else process.env.TZ = zone;
    }
  });
});

describe("formatTripLength", () => {
  it.each([
    ["2026-12-04", "2026-12-07", "3 nights"],
    ["2026-12-04", "2026-12-05", "1 night"],
    ["2026-12-04", "2026-12-04", "Day trip"],
    ["2027-03-27", "2027-03-29", "2 nights"],
  ])("%s to %s is %s", (start, end, expected) => {
    expect(formatTripLength(start, end)).toBe(expected);
  });

  it("needs both dates", () => {
    expect(formatTripLength("2026-12-04", null)).toBeNull();
    expect(formatTripLength(null, null)).toBeNull();
  });
});
