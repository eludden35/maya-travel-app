import Link from "next/link";

import { requireProfile } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";

/**
 * Hello-world landing page (server component).
 *
 * Dual purpose: it renders something real for the scaffold, and it proves the
 * server-side Supabase pattern works end-to-end (cookies -> server client ->
 * `getUser()` -> server-rendered HTML). When real DB tables and trips exist,
 * this becomes the trip-list dashboard.
 *
 * Onboarding gate: signed-in users without a Profile row are redirected to
 * `/onboarding/handle` by `requireProfile()` (Bead tripplanner-s3a.1). New
 * users land here, get bounced to onboarding, pick a handle, and come back.
 *
 * The big "$0" numeral is intentional — it validates that the Fraunces +
 * Inter pairing actually loaded and that the Tailwind tokens
 * (`text-ink` / `bg-paper` / `font-display`) are wired correctly. It is a
 * scaffold smoke-test, not a product UI element.
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const profile = user ? await requireProfile() : null;

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 bg-paper text-ink">
      <div className="w-full max-w-sm flex flex-col items-center gap-10 text-center">
        <header className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
            Jettison
          </p>
          <h1 className="font-display text-4xl leading-tight">
            {profile ? `Hello, ${profile.display_name}` : "Welcome"}
          </h1>
          <p className="text-secondary">
            {profile
              ? `Signed in as @${profile.handle}. The real product is coming.`
              : "Sign in to see your trips and balances."}
          </p>
        </header>

        {/* Signature motif: oversized money numerals (tabular figures).
            Only here as a scaffold smoke-test for the type pairing. */}
        <section
          aria-label="Sample balance"
          className="flex flex-col items-center gap-1"
        >
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
            You owe
          </p>
          <p className="font-display text-7xl leading-none tabular-nums text-ink">
            $0
          </p>
          <p className="text-sm text-secondary">
            across <span className="font-mono">0</span> trips
          </p>
        </section>

        {profile ? (
          <form
            action="/auth/sign-out"
            method="post"
            className="w-full"
          >
            <button
              type="submit"
              className="w-full h-12 rounded-md bg-ink text-paper font-medium hover:opacity-90"
            >
              Sign out
            </button>
          </form>
        ) : (
          <Link
            href="/auth/sign-in"
            className="w-full h-12 rounded-md bg-ember text-ink font-medium flex items-center justify-center hover:opacity-90"
          >
            Sign in
          </Link>
        )}
      </div>
    </main>
  );
}
