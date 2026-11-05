import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

/*
 * Security headers for every route.
 *
 * The CSP still allows inline scripts and styles: Next.js injects inline
 * bootstrap scripts, and a nonce-based policy would force every page through
 * the proxy to mint a nonce. Everything else is locked to this origin, the
 * Supabase project and Sentry's ingest hosts.
 */
const isDev = process.env.NODE_ENV !== "production";

const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();
const supabaseRealtimeOrigin = supabaseOrigin.replace(/^http/, "ws");
const sentryIngest =
  "https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin}`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseRealtimeOrigin} ${sentryIngest}${isDev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

// Until launch, every environment stays out of search results. Set
// ALLOW_INDEXING=true on production when it exists (see app/robots.ts).
if (process.env.ALLOW_INDEXING !== "true") {
  securityHeaders.push({ key: "X-Robots-Tag", value: "noindex, nofollow" });
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Since 16.3, `next dev` writes its own block into AGENTS.md whenever a
  // coding agent starts it, which dirties the tree in every agent session.
  // AGENTS.md is written by hand here and points at the bundled docs itself.
  agentRules: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// Source maps upload to Sentry only when SENTRY_AUTH_TOKEN (plus SENTRY_ORG
// and SENTRY_PROJECT) is set, e.g. on Vercel. Local and CI builds skip it.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  silent: !process.env.CI,
  telemetry: false,
});
