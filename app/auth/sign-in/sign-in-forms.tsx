"use client";

import { useTransition } from "react";

import { requestSignInCode, verifySignInCode } from "@/app/auth/actions";

/**
 * Thin client shells around the two sign-in Server Actions. They own only
 * the pending state; validation and error copy come from the server.
 */

const inputClasses =
  "h-12 px-3 rounded-md border border-hairline bg-card text-ink focus-visible:outline-2 focus-visible:outline-ember";
const primaryButtonClasses =
  "h-12 rounded-md bg-ember text-ink font-medium disabled:opacity-60";

export function EmailForm({ next }: { next: string | null }) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => startTransition(() => requestSignInCode(formData))}
      className="flex flex-col gap-4"
    >
      {next ? <input type="hidden" name="next" value={next} /> : null}
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
          className={inputClasses}
        />
      </label>

      <button type="submit" disabled={pending} className={primaryButtonClasses}>
        {pending ? "Sending..." : "Send code"}
      </button>
    </form>
  );
}

export function CodeForm() {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <form
        action={(formData) => startTransition(() => verifySignInCode(formData))}
        className="flex flex-col gap-4"
      >
        <label className="flex flex-col gap-1">
          <span className="text-sm text-secondary">Code</span>
          <input
            type="text"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            enterKeyHint="go"
            pattern="[0-9 ]*"
            maxLength={12}
            required
            autoFocus
            disabled={pending}
            className={`${inputClasses} font-mono text-xl tracking-[0.3em]`}
          />
        </label>

        <button type="submit" disabled={pending} className={primaryButtonClasses}>
          {pending ? "Checking..." : "Sign in"}
        </button>
      </form>

      <form
        action={(formData) => startTransition(() => requestSignInCode(formData))}
      >
        <input type="hidden" name="resend" value="1" />
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 text-sm text-secondary underline underline-offset-4 hover:text-ink disabled:opacity-60"
        >
          Send a new code
        </button>
      </form>
    </div>
  );
}
