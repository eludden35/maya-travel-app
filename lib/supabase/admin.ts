import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/database.types";

/**
 * Server-only Supabase client carrying the SECRET key
 * (`sb_secret_*` / `SUPABASE_SECRET_KEY`). RLS-bypassing.
 *
 * **First service-role module in the repo.** Until this file landed
 * (Bead `tripplanner-s3a.4`), no module under `lib/` referenced
 * `SUPABASE_SECRET_KEY`; the boundary `rg` for the secret key starts
 * matching this single file as of s3a.4 — that is intentional.
 *
 * Use ONLY for operations that legitimately need to bypass RLS, e.g.
 * cross-bucket storage moves on moderator approval (`lib/images.ts`).
 * The intended consumer at MVP is `lib/images.ts`; new consumers must
 * be reviewed against `.cursor/rules/supabase-security.mdc` ("API keys"
 * + "Hard rules from ADR 0002") before being added.
 *
 * Hard rule (`.cursor/rules/supabase-security.mdc` "API keys"): never
 * reachable from a `"use client"` module. The `import "server-only"`
 * directive above produces a build-time error if any client component
 * imports this transitively, so the secret cannot reach the browser
 * bundle even by accident.
 *
 * Per-call construction (rather than a module-scoped singleton): a long-
 * lived process holds the secret in memory regardless, but per-call
 * construction keeps the chokepoint grep-able and avoids accidental
 * top-level imports that would force every importing module into the
 * server bundle.
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
