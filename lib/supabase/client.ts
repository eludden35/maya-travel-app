"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/database.types";

/**
 * Browser-side Supabase client.
 *
 * Use only inside `"use client"` modules. Reads the public publishable key
 * (`sb_publishable_*`, the new Supabase API-key naming for what used to be
 * the anon key), which is intentionally shipped to the browser. RLS is the
 * protection — see `.cursor/rules/supabase-security.mdc`.
 *
 * Generic-parameterized with `Database` from `database.types.ts` so callers
 * get end-to-end row typing (regenerate via `supabase gen types typescript
 * --linked > database.types.ts` after every schema change).
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
