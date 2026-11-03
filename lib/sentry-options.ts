/**
 * Shared Sentry settings for the browser, server and edge runtimes.
 *
 * Errors only: no performance tracing and no session replay. No default PII,
 * so Sentry stores no IP addresses, cookies or request bodies. The DSN is
 * public by design (it only allows sending events), hence NEXT_PUBLIC_.
 * NEXT_PUBLIC_APP_ENV tags events ("uat", "production"); it is set per
 * Vercel environment rather than read from VERCEL_ENV, because UAT runs on
 * Vercel's "production" environment.
 *
 * Invite links carry a bearer token in their path (/join/<token>), and
 * events and breadcrumbs record URLs, so every event and breadcrumb is
 * scrubbed before it leaves the process.
 */
export function sentryOptions() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? "local",
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: scrubInviteTokens,
    beforeBreadcrumb: scrubInviteTokens,
  };
}

const INVITE_PATH = /\/join\/[A-Za-z0-9_-]+/g;

/**
 * Rewrites every `/join/<token>` inside `data` to `/join/[token]`, wherever
 * it sits: request URL, transaction name, breadcrumb, exception message.
 * The app moves the token into a cookie after one hop
 * (`app/join/[token]/route.ts`), so this is the backstop. Data without an
 * invite path comes back untouched, as the same object.
 */
export function scrubInviteTokens<T>(data: T): T {
  let json: string | undefined;
  try {
    json = JSON.stringify(data);
  } catch {
    return data;
  }
  if (json === undefined) {
    return data;
  }
  const scrubbed = json.replace(INVITE_PATH, "/join/[token]");
  return scrubbed === json ? data : (JSON.parse(scrubbed) as T);
}
