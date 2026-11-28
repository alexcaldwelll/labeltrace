// T052: who may use the review and owner pages (src/lib/auth/session.ts;
// contracts/api.md; FR-029, FR-033). The Supabase connection is a stand-in (a fake
// user and a fake reviewers row); the real access rules are tested in
// tests/fast/db/review-rls.test.ts.
import { describe, expect, it, vi } from "vitest";

// This runs as plain test code, not Next.js server code, so let the server-only file load.
vi.mock("server-only", () => ({}));

const { requireOwner, requireReviewer } = await import("@/lib/auth/session");
type SessionClient = import("@/lib/auth/session").SessionClient;

/** A stand-in session: who is signed in, and their reviewers row. */
function fakeSession(
  userId: string | null,
  row: { role: "reviewer" | "owner"; active: boolean } | null,
): SessionClient {
  return {
    userId: async () => userId,
    reviewerRow: async () => row,
  };
}

describe("requireReviewer and requireOwner (T052)", () => {
  it("signed out → 401", async () => {
    expect(await requireReviewer(fakeSession(null, null))).toEqual({ ok: false, status: 401 });
  });

  it("an inactive reviewer → 403", async () => {
    expect(await requireReviewer(fakeSession("u1", { role: "reviewer", active: false }))).toEqual({
      ok: false,
      status: 403,
    });
  });

  it("the owner passes requireReviewer (FR-033)", async () => {
    expect(await requireReviewer(fakeSession("o1", { role: "owner", active: true }))).toEqual({
      ok: true,
      userId: "o1",
      role: "owner",
    });
  });
});

// Owner-approved extras (2026-11-28, detail 8).
describe("requireReviewer and requireOwner (extras)", () => {
  it("a signed-in user with no reviewers row → 403", async () => {
    expect(await requireReviewer(fakeSession("u2", null))).toEqual({ ok: false, status: 403 });
  });

  it("an active reviewer passes requireReviewer but gets 403 from requireOwner", async () => {
    const session = fakeSession("r1", { role: "reviewer", active: true });
    expect(await requireReviewer(session)).toEqual({ ok: true, userId: "r1", role: "reviewer" });
    expect(await requireOwner(session)).toEqual({ ok: false, status: 403 });
  });

  it("an inactive owner → 403 from both", async () => {
    const session = fakeSession("o2", { role: "owner", active: false });
    expect(await requireReviewer(session)).toEqual({ ok: false, status: 403 });
    expect(await requireOwner(session)).toEqual({ ok: false, status: 403 });
  });
});
