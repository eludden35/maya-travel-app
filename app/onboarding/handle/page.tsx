import { redirect } from "next/navigation";

import { submitHandleAction } from "@/app/onboarding/handle/actions";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profiles";

import { HandleForm } from "./handle-form";

/**
 * Onboarding step: pick a handle + display name.
 *
 * Distinctive treatment per `.cursor/skills/project-ui-ux/SKILL.md` —
 * leans on the postcard motif (handle = the name on the front of the
 * postcard) without being decorative. The big Fraunces "@" is the visual
 * anchor; the form below is calm Inter + a single Ember CTA.
 *
 * Server component for the surrounding chrome; the form itself is a thin
 * client shell (`HandleForm`) that owns the pending state.
 *
 * Routing rules (enforced here, not just by `requireProfile`):
 *  - Not signed in -> redirect to /auth/sign-in.
 *  - Signed in AND profile already exists -> redirect to /.
 *  - Signed in AND no profile -> render this page.
 *
 * `?error=...` from the Server Action is read here and rendered next to the
 * field. Error codes are an enum, never reflected free-form.
 */
export default async function OnboardingHandlePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/sign-in");
  }

  const existing = await getCurrentProfile();
  if (existing) {
    redirect("/");
  }

  const { error } = await searchParams;
  const errorCopy = errorMessageFor(error);

  const defaultDisplayName = (user.email ?? "")
    .split("@")[0]
    ?.replace(/[^a-zA-Z0-9 ]/g, " ")
    ?.trim()
    ?.slice(0, 50) ?? "";

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 bg-paper text-ink">
      <div className="w-full max-w-sm flex flex-col gap-10">
        <header className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
            Jettison
          </p>
          <h1 className="font-display text-3xl leading-tight">
            Address your first postcard.
          </h1>
          <p className="text-secondary text-sm">
            Pick the handle people will find you under, and the name they&apos;ll
            see on your trips.
          </p>
        </header>

        <section
          aria-label="Handle preview"
          className="flex flex-col items-center gap-1"
        >
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
            You&apos;ll be
          </p>
          <p
            id="handle-preview"
            aria-live="polite"
            className="font-display text-5xl leading-none text-ink"
          >
            <span className="text-secondary">@</span>
            <span data-handle-preview>your_handle</span>
          </p>
        </section>

        <HandleForm
          action={submitHandleAction}
          defaultDisplayName={defaultDisplayName}
          error={errorCopy}
          errorField={errorFieldFor(error)}
        />
      </div>
    </main>
  );
}

function errorMessageFor(code: string | undefined): string | null {
  switch (code) {
    case "invalid_handle":
      return "Handles are 3–30 characters, lowercase letters, numbers, and underscores only.";
    case "handle_taken":
      return "That handle is taken. Try another.";
    case "invalid_display_name":
      return "Display name must be 1–50 characters.";
    case "unauthorized":
      return "You need to be signed in to do that.";
    case "unknown":
      return "Something went wrong. Please try again.";
    default:
      return null;
  }
}

function errorFieldFor(code: string | undefined): "handle" | "display_name" | null {
  switch (code) {
    case "invalid_handle":
    case "handle_taken":
      return "handle";
    case "invalid_display_name":
      return "display_name";
    default:
      return null;
  }
}
