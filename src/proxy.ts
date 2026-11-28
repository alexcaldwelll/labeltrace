// T052: keeps reviewer and owner sign-in cookies fresh (Supabase's access token lasts
// an hour). Next.js 16 runs this before each matching request.
//
// It runs ONLY on the sign-in, review, and owner paths (config.matcher below). The
// public question page and /api/ask never touch sign-in cookies.
//
// It only refreshes the sign-in. Who may see what is decided by requireReviewer() and
// requireOwner() (src/lib/auth/session.ts) and the database's access rules, never here.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });
  // Asking the auth server who is signed in refreshes the cookies when needed.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/login", "/review/:path*", "/owner/:path*", "/api/review/:path*", "/api/owner/:path*"],
};
