const BASE = "https://jettison.invalid";

/**
 * Returns `value` as a same-origin path ("/trips/1?x=y#z") or `fallback`.
 *
 * Parses with the WHATWG URL parser, the same one browsers use, so tricks
 * like "//evil.com", "/\\evil.com" or "/\t/evil.com" (tabs and newlines are
 * stripped, leaving "//evil.com") resolve to another origin and are refused.
 */
export function safeNextPath(
  value: string | null | undefined,
  fallback = "/",
): string {
  if (!value || !value.startsWith("/")) {
    return fallback;
  }
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) {
    return fallback;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
