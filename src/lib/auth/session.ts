// T052: who is signed in, and whether they may use the review or owner pages
// (contracts/api.md "Reviewer endpoints", "Owner endpoints"; FR-029, FR-033).
//
// - requireReviewer(): signed out → 401; signed in but not an active reviewer → 403.
//   The owner counts as a reviewer (FR-033).
// - requireOwner(): signed out → 401; anyone but the active owner → 403.
//
// The signed-in user is checked with Supabase's auth server (auth.getUser()), never by
// trusting the cookie alone (getSession()), because a cookie can be faked. The role
// comes from the person's own `reviewers` row, read through the database's access
// rules (migration 0006), with the public key. The admin key is never used here.
//
// MFA for the owner comes in a follow-up task before T060 (owner's decision 1A,
// 2026-11-27); this file is password-only for now.
//
// The "server-only" line makes the build fail if browser code imports this file.
import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export type Role = "reviewer" | "owner";

export type AccessResult =
  { ok: true; userId: string; role: Role } | { ok: false; status: 401 | 403 };

/** What the checks need. The real one is built from the request's cookies; tests pass a fake. */
export interface SessionClient {
  /** The signed-in user's id, checked with the auth server, or null if signed out. */
  userId(): Promise<string | null>;
  /** The user's own reviewers row, or null if there is none. */
  reviewerRow(userId: string): Promise<{ role: Role; active: boolean } | null>;
}

function publicSettings(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set (see .env.example).",
    );
  }
  return { url, anonKey };
}

/** A Supabase connection for the signed-in user of this request (from its cookies). */
export async function createSessionClient(): Promise<SessionClient> {
  const { url, anonKey } = publicSettings();
  const store = await cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) store.set(name, value, options);
        } catch {
          // Pages can't set cookies; the proxy (src/proxy.ts) keeps them fresh instead.
        }
      },
    },
  });
  return {
    async userId() {
      const { data, error } = await supabase.auth.getUser();
      return error || !data.user ? null : data.user.id;
    },
    async reviewerRow(userId) {
      const { data, error } = await supabase
        .from("reviewers")
        .select("role, active")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(`Couldn't read the reviewers row (${error.code}).`);
      return (data as { role: Role; active: boolean } | null) ?? null;
    },
  };
}

async function check(need: Role, client?: SessionClient): Promise<AccessResult> {
  const session = client ?? (await createSessionClient());
  const userId = await session.userId();
  if (userId === null) return { ok: false, status: 401 };
  const row = await session.reviewerRow(userId);
  if (row === null || !row.active) return { ok: false, status: 403 };
  if (need === "owner" && row.role !== "owner") return { ok: false, status: 403 };
  return { ok: true, userId, role: row.role };
}

/** Signed in as an active reviewer or the owner (FR-029, FR-033). */
export function requireReviewer(client?: SessionClient): Promise<AccessResult> {
  return check("reviewer", client);
}

/** Signed in as the active owner. */
export function requireOwner(client?: SessionClient): Promise<AccessResult> {
  return check("owner", client);
}
