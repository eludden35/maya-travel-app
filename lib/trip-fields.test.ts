import { describe, expect, it } from "vitest";

import { isIsoDate, readTripCurrency, readTripDetails } from "@/lib/trip-fields";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("readTripDetails", () => {
  it("trims every field", () => {
    expect(
      readTripDetails(
        form({
          name: "  Porto weekend ",
          description: "\n Port wine and tiles. \n",
          start_date: " 2026-12-04",
          end_date: "2026-12-07 ",
        }),
      ),
    ).toEqual({
      name: "Porto weekend",
      description: "Port wine and tiles.",
      startDate: "2026-12-04",
      endDate: "2026-12-07",
    });
  });

  it("turns blank optional fields into null", () => {
    expect(
      readTripDetails(form({ name: "Porto", description: "   ", start_date: "", end_date: "" })),
    ).toEqual({ name: "Porto", description: null, startDate: null, endDate: null });
  });

  it("reads missing fields as empty", () => {
    expect(readTripDetails(new FormData())).toEqual({
      name: "",
      description: null,
      startDate: null,
      endDate: null,
    });
    expect(readTripCurrency(new FormData())).toBe("");
  });
});

describe("isIsoDate", () => {
  it.each(["2026-12-04", "2028-02-29", "1900-01-01", "2999-12-31"])("accepts %s", (value) => {
    expect(isIsoDate(value)).toBe(true);
  });

  it.each(["2026-02-29", "2026-13-01", "2026-12-32", "12/04/2026", "2026-1-4", "", "0050-01-01"])(
    "rejects %j",
    (value) => {
      expect(isIsoDate(value)).toBe(false);
    },
  );
});
