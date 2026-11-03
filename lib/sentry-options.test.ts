import { describe, expect, it } from "vitest";

import { scrubInviteTokens, sentryOptions } from "@/lib/sentry-options";

const TOKEN = "Xk3_9a-ZqP0wLmN4bC7dEf";

describe("scrubInviteTokens", () => {
  it("rewrites invite tokens wherever they sit in an event", () => {
    const event = {
      transaction: `/join/${TOKEN}`,
      request: { url: `https://uat.example.com/join/${TOKEN}?from=chat` },
      exception: { values: [{ value: `Failed to load /join/${TOKEN}` }] },
      breadcrumbs: [
        { category: "navigation", data: { from: `/join/${TOKEN}`, to: "/join" } },
      ],
    };

    const scrubbed = scrubInviteTokens(event);

    expect(JSON.stringify(scrubbed)).not.toContain(TOKEN);
    expect(scrubbed.request.url).toBe("https://uat.example.com/join/[token]?from=chat");
    expect(scrubbed.transaction).toBe("/join/[token]");
    expect(scrubbed.breadcrumbs[0]?.data.to).toBe("/join");
  });

  it("returns data without an invite path as the same object", () => {
    const event = { request: { url: "https://uat.example.com/trips/1" } };
    expect(scrubInviteTokens(event)).toBe(event);
  });

  it("leaves data it can't serialize alone", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(scrubInviteTokens(circular)).toBe(circular);
  });
});

describe("sentryOptions", () => {
  it("scrubs events and breadcrumbs in every runtime", () => {
    const options = sentryOptions();
    const event = { request: { url: `https://uat.example.com/join/${TOKEN}` } };
    const breadcrumb = { category: "fetch", data: { url: `/join/${TOKEN}` } };

    expect(JSON.stringify(options.beforeSend(event))).not.toContain(TOKEN);
    expect(JSON.stringify(options.beforeBreadcrumb(breadcrumb))).not.toContain(TOKEN);
  });

  it("stays off without a DSN and sends no default PII", () => {
    const options = sentryOptions();
    expect(options.sendDefaultPii).toBe(false);
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
      expect(options.enabled).toBe(false);
    }
  });
});
