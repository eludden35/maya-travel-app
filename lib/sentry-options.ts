/**
 * Shared Sentry settings for the browser, server and edge runtimes.
 *
 * Errors only: no performance tracing and no session replay. No default PII,
 * so Sentry stores no IP addresses, cookies or request bodies. The DSN is
 * public by design (it only allows sending events), hence NEXT_PUBLIC_.
 * NEXT_PUBLIC_APP_ENV tags events ("uat", "production"); it is set per
 * Vercel environment rather than read from VERCEL_ENV, because UAT runs on
 * Vercel's "production" environment.
 */
export function sentryOptions() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? "local",
    sendDefaultPii: false,
    tracesSampleRate: 0,
  };
}
