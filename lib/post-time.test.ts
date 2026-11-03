import { describe, expect, it } from "vitest";

import { dayNumber, formatPostTime, parsePostTime } from "@/lib/post-time";

// Newer ICU puts a narrow no-break space before AM/PM.
const plain = (text: string) => text.replace(/ /g, " ");

const CHICAGO = "America/Chicago";
// 2026-11-03 10:30 in Chicago (UTC-6).
const NOW = new Date("2026-11-03T16:30:00Z");
const today = dayNumber(NOW, CHICAGO);

describe("parsePostTime", () => {
  it("reads the microsecond timestamps Postgres sends", () => {
    expect(parsePostTime("2026-11-03T16:00:15.123456+00:00").toISOString()).toBe(
      "2026-11-03T16:00:15.123Z",
    );
    expect(parsePostTime("2026-11-03T16:00:15+00:00").toISOString()).toBe(
      "2026-11-03T16:00:15.000Z",
    );
  });
});

describe("dayNumber", () => {
  it("counts calendar days in the given time zone", () => {
    // 03:00 UTC on Nov 4 is still Nov 3 in Chicago.
    const lateEvening = new Date("2026-11-04T03:00:00Z");
    expect(dayNumber(lateEvening, CHICAGO)).toBe(today);
    expect(dayNumber(lateEvening, "UTC")).toBe(today + 1);
  });
});

describe("formatPostTime", () => {
  const format = (iso: string) => plain(formatPostTime(iso, CHICAGO, today));

  it("says Today with the reader's local time", () => {
    expect(format("2026-11-03T15:12:00Z")).toBe("Today, 9:12 AM");
  });

  it("uses the reader's calendar day, not UTC's", () => {
    // Nov 3, 03:00 UTC was the evening of Nov 2 in Chicago.
    expect(format("2026-11-03T03:00:00Z")).toBe("Yesterday, 9:00 PM");
  });

  it("names the day for older posts this year", () => {
    expect(format("2026-10-30T14:05:00Z")).toBe("Oct 30, 9:05 AM");
  });

  it("names the year for posts from an earlier year, without the time", () => {
    expect(format("2025-12-30T18:00:00Z")).toBe("Dec 30, 2025");
  });

  it("treats a post from a moment in the future as today", () => {
    expect(format("2026-11-03T16:31:00Z")).toBe("Today, 10:31 AM");
  });

  it("spells the time out with its zone before the reader's day is known", () => {
    expect(plain(formatPostTime("2026-11-03T15:12:00Z", "UTC", null))).toBe(
      "Nov 3, 2026, 3:12 PM UTC",
    );
  });
});
