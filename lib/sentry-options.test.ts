import { createServer, request, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";

import * as Sentry from "@sentry/nextjs";
import { describe, expect, it } from "vitest";

import { scrubSensitiveText, sentryOptions } from "@/lib/sentry-options";

const TOKEN = "Xk3_9a-ZqP0wLmN4bC7dEf";
const EMAIL = "fran.friend+trips@example.org";
// Kept out of the lines around the throw below, which the event quotes.
const LOOPBACK = "127.0.0.1";

describe("scrubSensitiveText", () => {
  it("rewrites invite tokens wherever they sit in an event", () => {
    const event = {
      transaction: `/join/${TOKEN}`,
      request: { url: `https://uat.example.com/join/${TOKEN}?from=chat` },
      exception: { values: [{ value: `Failed to load /join/${TOKEN}` }] },
      breadcrumbs: [
        { category: "navigation", data: { from: `/join/${TOKEN}`, to: "/join" } },
      ],
    };

    const scrubbed = scrubSensitiveText(event);

    expect(JSON.stringify(scrubbed)).not.toContain(TOKEN);
    expect(scrubbed.request.url).toBe("https://uat.example.com/join/[token]?from=chat");
    expect(scrubbed.transaction).toBe("/join/[token]");
    expect(scrubbed.breadcrumbs[0]?.data.to).toBe("/join");
  });

  it("rewrites email addresses, typed or URL-encoded, wherever they sit", () => {
    const event = {
      exception: {
        values: [{ value: `Email address "${EMAIL}" cannot be used as it is not authorized` }],
      },
      request: { url: `https://uat.example.com/auth/sign-in?email=${encodeURIComponent(EMAIL)}` },
      breadcrumbs: [{ category: "console", message: `signInWithOtp failed for ${EMAIL}` }],
    };

    const scrubbed = scrubSensitiveText(event);

    expect(JSON.stringify(scrubbed)).not.toContain("fran");
    expect(scrubbed.exception.values[0]?.value).toBe(
      'Email address "[email]" cannot be used as it is not authorized',
    );
    expect(scrubbed.request.url).toBe("https://uat.example.com/auth/sign-in?email=[email]");
    expect(scrubbed.breadcrumbs[0]?.message).toBe("signInWithOtp failed for [email]");
  });

  it("leaves file paths and package versions alone, so stack traces still match source maps", () => {
    const event = {
      frames: [
        { filename: "/var/task/.next/server/app/join/page.js" },
        { filename: "app:///_next/static/chunks/app/join/page-3f9a1c.js" },
        { filename: "app/join/join-button.tsx" },
        {
          filename:
            "/app/node_modules/.pnpm/@sentry+nextjs@11.10.0_next@16.2.4_@babel+core@7.29.0/node_modules/@sentry/nextjs/build/cjs/index.server.js",
        },
      ],
      modules: { "@sentry/nextjs": "11.10.0", next: "16.2.4" },
    };
    expect(scrubSensitiveText(event)).toBe(event);
  });

  it("returns data with nothing to scrub as the same object", () => {
    const event = { request: { url: "https://uat.example.com/trips/1" } };
    expect(scrubSensitiveText(event)).toBe(event);
  });

  it("stays fast on long runs of text that look like the start of an address", () => {
    const event = { message: `${"a.".repeat(50_000)}%40${"b".repeat(50_000)}` };
    expect(scrubSensitiveText(event)).toBe(event);
  });

  it("leaves data it can't serialize alone", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(scrubSensitiveText(circular)).toBe(circular);
  });
});

describe("sentryOptions", () => {
  it("scrubs events and breadcrumbs in every runtime", () => {
    const options = sentryOptions();
    const event = { request: { url: `https://uat.example.com/join/${TOKEN}` } };
    const breadcrumb = { category: "console", message: `Sign-in failed for ${EMAIL}` };

    expect(JSON.stringify(options.beforeSend(event))).not.toContain(TOKEN);
    expect(JSON.stringify(options.beforeBreadcrumb(breadcrumb))).not.toContain(EMAIL);
  });

  it("stays off without a DSN", () => {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
      expect(sentryOptions().enabled).toBe(false);
    }
  });
});

// UAT entry criterion E4: no email address and no IP address in an event
// (tripplanner-7pl). SDK 11 ignores sendDefaultPii, so this starts the SDK the
// way sentry.server.config.ts does, sends a sign-in form post through a real
// HTTP server, and reads the envelope that would go to Sentry.
describe("a server error during sign-in", () => {
  const CLIENT_IP = "203.0.113.7";
  const SIGN_IN_CODE = "918273";

  async function captureSignInError() {
    const envelopes: unknown[] = [];
    Sentry.init({
      ...sentryOptions(),
      dsn: "https://public@o0.ingest.sentry.io/0",
      enabled: true,
      transport: () => ({
        send: async (envelope: unknown) => {
          envelopes.push(envelope);
          return {};
        },
        flush: async () => true,
      }),
    });

    const server = createServer(async (req, res) => {
      await readForm(req);
      Sentry.addBreadcrumb({ category: "console", message: `signInWithOtp failed for ${EMAIL}` });
      Sentry.captureException(
        new Error(`Email address "${EMAIL}" cannot be used as it is not authorized`),
      );
      res.end("ok");
    });
    await new Promise<void>((resolve) => server.listen(0, LOOPBACK, resolve));
    const { port } = server.address() as AddressInfo;

    const body = `email=${encodeURIComponent(EMAIL)}&code=${SIGN_IN_CODE}`;
    await new Promise<void>((resolve, reject) => {
      const req = request(
        {
          host: LOOPBACK,
          port,
          method: "POST",
          path: `/auth/sign-in?email=${encodeURIComponent(EMAIL)}&next=%2Fjoin`,
          headers: {
            // What Vercel's edge adds in front of the app.
            host: "uat.jettison.test",
            "x-forwarded-for": `${CLIENT_IP}, 10.1.2.3`,
            "x-vercel-forwarded-for": CLIENT_IP,
            "x-real-ip": CLIENT_IP,
            forwarded: `for=${CLIENT_IP};proto=https`,
            "x-vercel-ip-city": "Porto",
            "x-vercel-ip-latitude": "41.1579",
            "x-vercel-id": "cdg1::iad1::abcde-1730000000000-0123456789ab",
            // What the browser sends.
            "user-agent": "Mozilla/5.0 (Linux; Android 14; Pixel 7) Mobile",
            referer: `https://uat.jettison.test/auth/sign-in?email=${encodeURIComponent(EMAIL)}`,
            "content-type": "application/x-www-form-urlencoded",
            "content-length": Buffer.byteLength(body),
            cookie: `jtsn_signin_email=${encodeURIComponent(EMAIL)}; jtsn_invite=${TOKEN}`,
          },
        },
        (res) => {
          res.resume();
          res.on("end", resolve);
        },
      );
      req.on("error", reject);
      req.end(body);
    });

    await Sentry.flush(2000);
    await Sentry.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));

    return envelopes
      .flatMap((envelope) => (envelope as [unknown, [{ type: string }, unknown][]])[1])
      .filter(([item]) => item.type === "event")
      .map(([, payload]) => payload as Sentry.Event);
  }

  it("carries no IP address, email address, cookie, body or query string", async () => {
    const events = await captureSignInError();

    expect(events).toHaveLength(1);
    const event = events[0];
    const sent = JSON.stringify(event);
    for (const leak of [
      "fran.friend", // typed or URL-encoded
      CLIENT_IP,
      LOOPBACK, // the socket's peer address
      "10.1.2.3",
      "Porto",
      "41.1579",
      TOKEN,
      `code=${SIGN_IN_CODE}`,
    ]) {
      expect(sent).not.toContain(leak);
    }
    expect(event?.user?.ip_address).toBeUndefined();
    expect(event?.server_name).toBeUndefined();
    expect(event?.request?.data).toBeUndefined();
    expect(event?.request?.cookies).toBeUndefined();
    expect(event?.request?.query_string).toBeUndefined();
    expect(event?.request?.url).toBe("http://uat.jettison.test/auth/sign-in");
    expect(event?.exception?.values?.[0]?.value).toBe(
      'Email address "[email]" cannot be used as it is not authorized',
    );
    // Enough is left to debug with: which browser, and Vercel's request id.
    const kept = Object.entries(event?.request?.headers ?? {})
      .filter(([, value]) => value !== "[Filtered]")
      .map(([name]) => name)
      .sort();
    expect(kept).toEqual(["user-agent", "x-vercel-id"]);
  });
});

// Next.js pipes a Server Action's form into its parser before the action
// runs. Piping reads through "data" listeners, which is where the SDK copies
// a request body.
async function readForm(req: IncomingMessage) {
  let form = "";
  await pipeline(
    req,
    new Writable({
      write(chunk, _encoding, done) {
        form += chunk;
        done();
      },
    }),
  );
  return form;
}
