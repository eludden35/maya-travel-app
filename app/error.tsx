"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Route-level error boundary. Server errors arrive with their message
 * replaced by a digest, so the page shows calm copy plus the digest as a
 * reference a tester can send us.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 bg-paper text-ink">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
            Jettison
          </p>
          <h1 className="font-display text-3xl leading-tight">
            Something went wrong.
          </h1>
          <p className="text-secondary text-sm">
            We couldn&apos;t load this page. Try again, and if it keeps
            happening, send us the reference below.
          </p>
          {error.digest ? (
            <p className="font-mono text-xs text-secondary">
              Reference: <span className="text-ink">{error.digest}</span>
            </p>
          ) : null}
        </header>

        <button
          type="button"
          onClick={reset}
          className="h-12 rounded-md bg-ember text-ink font-medium hover:opacity-90"
        >
          Try again
        </button>
        <Link
          href="/"
          className="min-h-11 inline-flex items-center text-sm text-secondary underline-offset-4 hover:underline"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
