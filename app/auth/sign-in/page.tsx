"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { signInWithMagicLink } from "@/app/auth/actions";

/**
 * Minimal magic-link sign-in form (`"use client"` because it owns the
 * pending state and reads the `?sent=1` / `?error=...` query string).
 *
 * The actual auth call happens in the Server Action — this component is a
 * thin shell around `<form action={signInWithMagicLink}>`. `SUPABASE_SERVICE_ROLE_KEY`
 * is never imported here (or anywhere on the client side); see
 * `.cursor/rules/typescript-react.mdc`.
 */
export default function SignInPage() {
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  const sent = search.get("sent") === "1";
  const error = search.get("error");

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 bg-paper text-ink">
      <div className="w-full max-w-sm flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
            Jettison
          </p>
          <h1 className="font-display text-3xl leading-tight">Sign in</h1>
          <p className="text-secondary text-sm">
            Enter your email and we&apos;ll send you a sign-in link.
          </p>
        </header>

        <form
          action={(formData) => {
            startTransition(() => signInWithMagicLink(formData));
          }}
          className="flex flex-col gap-4"
        >
          <label className="flex flex-col gap-1">
            <span className="text-sm text-secondary">Email</span>
            <input
              type="email"
              name="email"
              inputMode="email"
              autoComplete="email"
              enterKeyHint="send"
              required
              disabled={pending}
              className="h-12 px-3 rounded-md border border-hairline bg-card text-ink focus-visible:outline-2 focus-visible:outline-ember"
            />
          </label>

          <button
            type="submit"
            disabled={pending}
            className="h-12 rounded-md bg-ember text-ink font-medium disabled:opacity-60"
          >
            {pending ? "Sending..." : "Send link"}
          </button>
        </form>

        {sent ? (
          <p
            role="status"
            aria-live="polite"
            className="text-sm text-success"
          >
            Check your email for a sign-in link.
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="text-sm text-error"
          >
            {error}
          </p>
        ) : null}

        <Link
          href="/"
          className="text-sm text-secondary underline-offset-4 hover:underline"
        >
          Back home
        </Link>
      </div>
    </main>
  );
}
