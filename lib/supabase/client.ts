"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client.
 *
 * Use only inside `"use client"` modules. Reads the public anon key, which is
 * intentionally shipped to the browser. RLS is the protection — see
 * `.cursor/rules/supabase-security.mdc`.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
