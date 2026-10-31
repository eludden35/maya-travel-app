import { describe, expect, it } from "vitest";

import { maskIp, maskIpv4, maskIpv6, truncateUserAgent } from "@/lib/tos";

describe("maskIpv4", () => {
  it("keeps the /24 prefix", () => {
    expect(maskIpv4("192.168.1.42")).toBe("192.168.1.0");
  });

  it.each(["not an ip", "1.2.3", "1.2.3.256", "1.2.3.-1", "01.2.3.4567"])(
    "rejects %j",
    (value) => {
      expect(maskIpv4(value)).toBeNull();
    },
  );
});

describe("maskIpv6", () => {
  it("keeps the /48 prefix, expanding :: first", () => {
    expect(maskIpv6("2001:db8:abcd:1234::1")).toBe("2001:db8:abcd::");
    expect(maskIpv6("2001:DB8:ABCD:1:2:3:4:5")).toBe("2001:db8:abcd::");
    expect(maskIpv6("::1")).toBe("0:0:0::");
  });

  it.each(["::ffff:1.2.3.4", "1::2::3", "not an ip", "1:2:3:4:5:6:7:8:9"])(
    "rejects %j",
    (value) => {
      expect(maskIpv6(value)).toBeNull();
    },
  );
});

describe("maskIp", () => {
  it("dispatches on the presence of a colon", () => {
    expect(maskIp("203.0.113.9")).toBe("203.0.113.0");
    expect(maskIp(" 2001:db8:abcd:1234::1 ")).toBe("2001:db8:abcd::");
  });

  it("returns null for missing input", () => {
    expect(maskIp(null)).toBeNull();
    expect(maskIp(undefined)).toBeNull();
    expect(maskIp("  ")).toBeNull();
  });
});

describe("truncateUserAgent", () => {
  it("caps at 256 characters", () => {
    expect(truncateUserAgent("a".repeat(300))).toHaveLength(256);
    expect(truncateUserAgent("Mozilla/5.0")).toBe("Mozilla/5.0");
  });

  it("returns null for missing input", () => {
    expect(truncateUserAgent(null)).toBeNull();
    expect(truncateUserAgent("")).toBeNull();
  });
});
