import type { MetadataRoute } from "next";

/**
 * Pre-launch, no environment should be crawled. Production sets
 * ALLOW_INDEXING=true when it goes live; next.config.ts drops the
 * X-Robots-Tag header on the same switch.
 */
export default function robots(): MetadataRoute.Robots {
  if (process.env.ALLOW_INDEXING === "true") {
    return { rules: { userAgent: "*", allow: "/" } };
  }
  return { rules: { userAgent: "*", disallow: "/" } };
}
