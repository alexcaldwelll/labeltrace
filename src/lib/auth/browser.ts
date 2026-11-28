// T052: what the login page (src/app/login/page.tsx) uses in the browser.
//
// The sign-in client uses the PUBLIC Supabase key (NEXT_PUBLIC_SUPABASE_ANON_KEY),
// which is safe to send to the browser; it never uses the admin key. It saves the
// sign-in in cookies, so the server can check it (src/lib/auth/session.ts). This file
// is kept apart from the server code, so the login page never loads it.
import { createBrowserClient } from "@supabase/ssr";

/** The one message for every failed sign-in, so no one can tell if an email has an account. */
export const SIGN_IN_FAILED = "Email or password is wrong.";

/** The Supabase client for signing in. */
export function createLoginClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set (see .env.example).",
    );
  }
  return createBrowserClient(url, anonKey);
}

/**
 * Where to go after signing in: the `next` page, only if it's a path on this site
 * (starts with "/" but not "//" or "/\"), else "/".
 */
export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
