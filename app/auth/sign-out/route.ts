import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Sign out. POST-only to satisfy the "destructive verbs use POST" baseline —
 * a GET would let any link or prefetch sign the user out unexpectedly.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
