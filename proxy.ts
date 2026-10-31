import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts` and
 * the exported function from `middleware` to `proxy`. Same API, same
 * NextRequest/NextResponse semantics — just the name moved. See
 * https://nextjs.org/docs/messages/middleware-to-proxy.
 *
 * Inside `lib/supabase/middleware.ts` we keep the file name `middleware.ts`
 * because that matches the `@supabase/ssr` docs and is internal to our repo.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Run on every request EXCEPT static assets, image optimization output, the
  // generated icons / manifest / robots.txt, and the Next.js internals. Auth
  // cookies need refreshing on document requests and API requests only.
  matcher: [
    "/((?!_next/static|_next/image|icon|apple-icon|manifest.webmanifest|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
