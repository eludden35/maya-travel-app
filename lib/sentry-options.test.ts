import {
  NodeClient,
  defaultStackParser,
  makeNodeTransport,
  requestDataIntegration,
} from "@sentry/nextjs";
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

  it("leaves file paths alone, so stack traces still match source maps", () => {
    const event = {
      frames: [
        { filename: "/var/task/.next/server/app/join/page.js" },
        { filename: "app:///_next/static/chunks/app/join/page-3f9a1c.js" },
        { filename: "app/join/join-button.tsx" },
      ],
    };
    expect(scrubInviteTokens(event)).toBe(event);
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

  // SDK 11 ignores sendDefaultPii and collects cookies unless told not to.
  // This runs a server request through the SDK's own request-data step.
  it("keeps the invite cookie out of server events", async () => {
    const client = new NodeClient({
      ...sentryOptions(),
      integrations: [],
      stackParser: defaultStackParser,
      transport: makeNodeTransport,
    });
    const event = {
      sdkProcessingMetadata: {
        normalizedRequest: {
          url: "https://uat.example.com/join",
          method: "GET",
          headers: {
            cookie: `jtsn_invite=${TOKEN}; jtsn_signin_email=friend%40example.com`,
          },
        },
      },
    };

    const processed = await requestDataIntegration().processEvent?.(event, {}, client);
    // The envelope drops sdkProcessingMetadata; the rest of the event is sent.
    const sent = JSON.stringify(
      sentryOptions().beforeSend({ ...processed, sdkProcessingMetadata: undefined }),
    );

    expect(processed?.request?.url).toBe("https://uat.example.com/join");
    expect(sent).not.toContain(TOKEN);
    expect(sent).not.toContain("friend");
  });

  it("stays off without a DSN", () => {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
      expect(sentryOptions().enabled).toBe(false);
    }
  });
});
