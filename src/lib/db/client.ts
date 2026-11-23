// T009: the app's server-side connection to the Supabase database.
//
// It uses the service role key, which has full admin power over the database.
// The "server-only" line below makes the build fail if any browser code tries
// to import this file, so the key can never be sent to a user's browser.
import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

/** Returns the server's database connection, creating it the first time. */
export function getServerDb(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not set. Add it to your .env file (see .env.example).",
    );
  }
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to your .env file (see .env.example). " +
        "Only server code may use this key.",
    );
  }

  client = createClient(url, serviceRoleKey, {
    // The server has no signed-in user, so don't save or refresh logins.
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
