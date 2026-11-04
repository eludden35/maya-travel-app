import { NextResponse, type NextRequest } from "next/server";

import { forgetInvite } from "@/lib/auth-flow";
import { createClient } from "@/lib/supabase/server";

/**
 * Sign out. POST-only to satisfy the "destructive verbs use POST" baseline —
 * a GET would let any link or prefetch sign the user out unexpectedly.
 * Also forgets an invite being followed, so the next person on this browser
 * doesn't inherit it.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  await forgetInvite();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
