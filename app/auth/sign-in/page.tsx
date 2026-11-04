import Link from "next/link";

import { readInviteToken, readSignInEmail } from "@/lib/auth-flow";

import { CodeForm, EmailForm } from "./sign-in-forms";

/**
 * Two-step email sign-in: send a code, then enter it (or tap the emailed
 * link, which goes through /auth/confirm). The address between steps lives
 * in an httpOnly cookie, so the URL only ever carries `step` and an enum
 * `error` code — never the address and never free-form text.
 *
 * While an invite link is being followed (tripplanner-2o5.1), the code step
 * asks for the code rather than the emailed link: the invite lives in this
 * browser, and the link may open in another app's.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; error?: string; next?: string }>;
}) {
  const { step, error, next } = await searchParams;
  const email = step === "code" ? await readSignInEmail() : null;
  const showCode = email !== null;
  const invitePending = showCode && (await readInviteToken()) !== null;
  const errorCopy = errorMessageFor(
    step === "code" && !showCode ? "code_expired" : error,
  );

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 bg-paper text-ink">
      <div className="w-full max-w-sm flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
            Jettison
          </p>
          <h1 className="font-display text-3xl leading-tight">
            {showCode ? "Check your email" : "Sign in"}
          </h1>
          <p className="text-secondary text-sm">
            {showCode ? (
              <>
                We sent a sign-in code to{" "}
                <span className="font-mono text-ink">{maskEmail(email)}</span>.
                {invitePending
                  ? " Enter it here to carry on with your invite."
                  : " Enter it below, or tap the link in the email."}
              </>
            ) : (
              "Enter your email and we’ll send you a sign-in code."
            )}
          </p>
        </header>

        {showCode ? <CodeForm /> : <EmailForm next={next ?? null} />}

        {errorCopy ? (
          <p role="alert" className="text-sm text-error">
            {errorCopy}
          </p>
        ) : null}

        <Link
          href={showCode ? "/auth/sign-in" : "/"}
          className="min-h-11 inline-flex items-center text-sm text-secondary underline-offset-4 hover:underline"
        >
          {showCode ? "Use a different email" : "Back home"}
        </Link>
      </div>
    </main>
  );
}

function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}••••@${domain}`;
}

function errorMessageFor(code: string | undefined): string | null {
  switch (code) {
    case "missing_email":
      return "Enter your email address.";
    case "send_failed":
      return "We couldn’t send the email. Try again in a minute.";
    case "rate_limited":
      return "Too many attempts. Wait a few minutes and try again.";
    case "code_invalid":
      return "That code didn’t work. Check the latest email, or send a new code.";
    case "code_expired":
      return "Your sign-in timed out. Enter your email again.";
    case "link_invalid":
      return "That sign-in link has expired or was already used. Request a new code.";
    case "missing_code":
      return "That sign-in link is incomplete. Request a new code.";
    default:
      return null;
  }
}
