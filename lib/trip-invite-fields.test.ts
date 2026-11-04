import { describe, expect, it } from "vitest";

import {
  DEFAULT_INVITE_EXPIRY_DAYS,
  DEFAULT_INVITE_MAX_USES,
  INVITE_EXPIRY_CHOICES,
  INVITE_MAX_USES_CHOICES,
  formatExpiresIn,
  inviteLifetimeDays,
  inviteLinkState,
  isInviteToken,
  readInviteSettings,
} from "@/lib/trip-invite-fields";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const NOW = new Date("2026-11-03T12:00:00Z");

describe("isInviteToken", () => {
  it("accepts 22 base64url characters", () => {
    expect(isInviteToken("Xk3_9a-ZqP0wLmN4bC7dEf")).toBe(true);
  });

  it.each([
    ["too short", "Xk3_9a-ZqP0wLmN4bC7dE"],
    ["too long", "Xk3_9a-ZqP0wLmN4bC7dEfg"],
    ["padding", "Xk3_9a-ZqP0wLmN4bC7d=="],
    ["standard base64", "Xk3/9a+ZqP0wLmN4bC7dEf"],
    ["a path", "../../trips/aaaaaaaaaaa"],
    ["empty", ""],
  ])("refuses %s", (_label, value) => {
    expect(isInviteToken(value)).toBe(false);
  });

  it("refuses anything that isn't a string", () => {
    expect(isInviteToken(undefined)).toBe(false);
    expect(isInviteToken(null)).toBe(false);
    expect(isInviteToken(22)).toBe(false);
  });
});

describe("invite choices", () => {
  it("offer the founder's defaults, inside what the database accepts", () => {
    expect(INVITE_EXPIRY_CHOICES.map((choice) => choice.days)).toContain(
      DEFAULT_INVITE_EXPIRY_DAYS,
    );
    expect(INVITE_MAX_USES_CHOICES).toContain(DEFAULT_INVITE_MAX_USES);
    for (const { days } of INVITE_EXPIRY_CHOICES) {
      expect(days).toBeGreaterThanOrEqual(1);
      expect(days).toBeLessThanOrEqual(30);
    }
    for (const uses of INVITE_MAX_USES_CHOICES) {
      expect(uses).toBeGreaterThanOrEqual(1);
      expect(uses).toBeLessThanOrEqual(50);
    }
  });
});

describe("readInviteSettings", () => {
  it("reads whole numbers", () => {
    expect(readInviteSettings(form({ expires_in_days: "7", max_uses: " 10 " }))).toEqual({
      expiresInDays: 7,
      maxUses: 10,
    });
  });

  it("turns anything else into NaN for the write helper to refuse", () => {
    for (const value of ["", "7.5", "-1", "1e3", "seven", "1000"]) {
      const settings = readInviteSettings(form({ expires_in_days: value, max_uses: value }));
      expect(settings.expiresInDays).toBeNaN();
      expect(settings.maxUses).toBeNaN();
    }
    expect(readInviteSettings(new FormData()).expiresInDays).toBeNaN();
  });
});

describe("inviteLinkState", () => {
  const live = {
    expires_at: "2026-11-10T12:00:00Z",
    uses: 2,
    max_uses: 10,
    revoked_at: null,
  };

  it("is live until it expires, fills up or is turned off", () => {
    expect(inviteLinkState(live, NOW)).toBe("live");
  });

  it("checks in the database's order: turned off, expired, full", () => {
    expect(
      inviteLinkState(
        { expires_at: "2026-11-01T12:00:00Z", uses: 10, max_uses: 10, revoked_at: "2026-11-02T00:00:00Z" },
        NOW,
      ),
    ).toBe("revoked");
    expect(
      inviteLinkState({ ...live, expires_at: "2026-11-03T12:00:00Z", uses: 10 }, NOW),
    ).toBe("expired");
    expect(inviteLinkState({ ...live, uses: 10 }, NOW)).toBe("full");
  });
});

describe("inviteLifetimeDays", () => {
  it("is the whole days between making the link and its expiry", () => {
    expect(
      inviteLifetimeDays({
        created_at: "2026-11-03T12:00:00.123456+00:00",
        expires_at: "2026-11-10T12:00:00.123456+00:00",
      }),
    ).toBe(7);
  });
});

describe("formatExpiresIn", () => {
  it("counts days, then hours, then minutes", () => {
    expect(formatExpiresIn("2026-11-10T12:00:00Z", NOW)).toBe("in 7 days");
    expect(formatExpiresIn("2026-11-04T13:00:00Z", NOW)).toBe("in 1 day");
    expect(formatExpiresIn("2026-11-03T17:00:00Z", NOW)).toBe("in 5 hours");
    expect(formatExpiresIn("2026-11-03T12:03:00Z", NOW)).toBe("in 3 minutes");
  });

  it("never says zero", () => {
    expect(formatExpiresIn("2026-11-03T12:00:10Z", NOW)).toBe("in 1 minute");
  });
});
