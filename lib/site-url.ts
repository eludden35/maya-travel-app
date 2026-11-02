import "server-only";

/**
 * Canonical origin for links we put in emails and redirects.
 *
 * Never derived from request headers: the Origin and Host headers are
 * caller-controlled, and an allow-list with a wildcard would let an attacker
 * point a sign-in link at their own site. Set `SITE_URL` per environment
 * (e.g. https://uat.example.com); local development falls back to
 * http://localhost:3000.
 */
export function getSiteUrl(): string {
  const configured = process.env.SITE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }
  throw new Error("SITE_URL must be set in production");
}
