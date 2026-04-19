import Link from "next/link";

/**
 * Global footer — three legal links + a small Jettison kicker.
 *
 * Server component (no "use client", no client JS). Rendered once in the
 * root layout after `{children}`, so it ships on every route. The body
 * chrome is `min-h-full flex flex-col` and pages use `flex-1`, so this
 * pins to the bottom on short routes and trails the content on long ones.
 *
 * Visual treatment per `.cursor/skills/project-ui-ux/SKILL.md`: warm card
 * surface above paper, hairline divider, mono kicker line consistent with
 * the existing "Jettison · Section 01" pattern. No emoji, no icons —
 * legal links should read as quietly considered, not decorative.
 */
export function Footer() {
  return (
    <footer className="border-t border-hairline bg-card text-secondary">
      <div className="mx-auto w-full max-w-prose px-6 py-8 flex flex-col items-center gap-4 text-center">
        <nav aria-label="Legal" className="w-full">
          <ul className="flex flex-col sm:flex-row sm:justify-center gap-x-6 gap-y-2 text-sm">
            <li>
              <Link
                href="/legal/terms"
                className="inline-flex items-center justify-center min-h-11 px-2 underline decoration-hairline underline-offset-4 hover:text-ink"
              >
                Terms of Service
              </Link>
            </li>
            <li>
              <Link
                href="/legal/community-guidelines"
                className="inline-flex items-center justify-center min-h-11 px-2 underline decoration-hairline underline-offset-4 hover:text-ink"
              >
                Community Guidelines
              </Link>
            </li>
            <li>
              <Link
                href="/legal/privacy"
                className="inline-flex items-center justify-center min-h-11 px-2 underline decoration-hairline underline-offset-4 hover:text-ink"
              >
                Privacy
              </Link>
            </li>
          </ul>
        </nav>

        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
          Jettison · Template documents · Not lawyer-reviewed at MVP
        </p>
      </div>
    </footer>
  );
}
