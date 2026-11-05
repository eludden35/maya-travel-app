/**
 * Shared Sentry settings for the browser, server and edge runtimes.
 *
 * Errors only: no performance tracing and no session replay. The DSN is
 * public by design (it only allows sending events), hence NEXT_PUBLIC_.
 * NEXT_PUBLIC_APP_ENV tags events ("uat", "production"); it is set per
 * Vercel environment rather than read from VERCEL_ENV, because UAT runs on
 * Vercel's "production" environment.
 *
 * No email address or IP address may reach Sentry (UAT entry criterion E4,
 * tripplanner-7pl). SDK 11 no longer reads `sendDefaultPii`: `dataCollection`
 * decides what an event carries, and by default it collects nearly all of it.
 * So:
 * - `userInfo` is off: no `user.ip_address` from the request, Sentry's known
 *   IP headers are dropped, and the browser SDK asks Sentry never to infer an
 *   IP from the connection (`infer_ip: "never"`).
 * - Request headers are an allow-list: the user agent and Vercel's request
 *   id. Vercel also sends the client's location (`x-vercel-ip-city`,
 *   `-latitude`, `-postal-code` and more), which Sentry's IP-header list
 *   doesn't cover, and an allow-list doesn't depend on that list staying
 *   complete. The referrer is left out because it's the previous page's whole
 *   URL, query string included. No response headers.
 * - No request or response bodies: Server Action posts carry email
 *   addresses, sign-in codes and trip notes.
 * - No cookies: `jtsn_signin_email` holds an email address and `jtsn_invite`
 *   an invite link's bearer token (tripplanner-2o5.1).
 * - No query strings and no local variables, which can hold either.
 * - No server name: a serverless instance's host name helps no one, and
 *   nothing promises it isn't an address.
 *
 * Text is still sent as written: an error message or breadcrumb can quote an
 * email address, and an invite link carries its token in the path
 * (/join/<token>). So every event and breadcrumb is scrubbed before it leaves
 * the process. Sentry's project settings stop it storing IP addresses too;
 * that's a founder step, recorded with E4 in the UAT-1 test plan.
 */
export function sentryOptions() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? "local",
    sendDefaultPii: false,
    dataCollection: {
      userInfo: false,
      // Kept when a header's name contains one of these, ignoring case. Other
      // request headers send their name at most, never their value.
      httpHeaders: {
        request: { allow: ["user-agent", "x-vercel-id"] },
        response: false,
      },
      httpBodies: [],
      cookies: false,
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    includeServerName: false,
    tracesSampleRate: 0,
    beforeSend: scrubSensitiveText,
    beforeBreadcrumb: scrubSensitiveText,
  };
}

// The token's own shape, so file paths such as app/join/page.js keep theirs.
const INVITE_PATH = /\/join\/[A-Za-z0-9_-]{22}(?![A-Za-z0-9_-])/g;

// An address as typed or URL-encoded (`%40`). The top-level domain must be
// letters, which leaves package specifiers such as next@16.2.4 alone. The
// bounded parts keep a long run of text from making the match slow.
const EMAIL_ADDRESS =
  /[A-Za-z0-9._%+-]{1,64}(?:@|%40)[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}/g;

/**
 * Rewrites, wherever they sit inside `data` (request URL, transaction name,
 * breadcrumb, exception message):
 * - every `/join/<token>` to `/join/[token]`. The app moves the token into a
 *   cookie after one hop (`app/join/[token]/route.ts`), so this is the
 *   backstop;
 * - every email address to `[email]`.
 *
 * Data with neither comes back untouched, as the same object.
 */
export function scrubSensitiveText<T>(data: T): T {
  let json: string | undefined;
  try {
    json = JSON.stringify(data);
  } catch {
    return data;
  }
  if (json === undefined) {
    return data;
  }
  const scrubbed = json
    .replace(INVITE_PATH, "/join/[token]")
    .replace(EMAIL_ADDRESS, "[email]");
  return scrubbed === json ? data : (JSON.parse(scrubbed) as T);
}
