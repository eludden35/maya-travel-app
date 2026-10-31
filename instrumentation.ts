import * as Sentry from "@sentry/nextjs";

/**
 * Next.js instrumentation hook: loads the Sentry SDK for the server and edge
 * runtimes. With no NEXT_PUBLIC_SENTRY_DSN (local development) the SDK stays
 * disabled. See lib/sentry-options.ts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
