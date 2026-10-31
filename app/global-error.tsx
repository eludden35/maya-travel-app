"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Last-resort boundary for errors in the root layout itself. It replaces the
 * whole document, so it can't rely on the layout's fonts or stylesheet and
 * uses inline styles with the same palette.
 */
export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "#faf7f2",
          color: "#1a1714",
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        <main style={{ maxWidth: 384, display: "flex", flexDirection: "column", gap: 16 }}>
          <h1 style={{ fontSize: 30, lineHeight: 1.2, margin: 0 }}>
            Jettison hit a problem.
          </h1>
          <p style={{ fontFamily: "system-ui, sans-serif", color: "#5a4f3f", margin: 0 }}>
            Try again in a moment.
            {error.digest ? ` Reference: ${error.digest}` : ""}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              height: 48,
              borderRadius: 6,
              border: 0,
              background: "#d9531e",
              color: "#1a1714",
              fontSize: 16,
              fontWeight: 500,
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
