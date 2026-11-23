// T009: the server database connection can't load outside server code, and a
// missing service role key gives a clear error.
//
// These tests run as plain code, not as Next.js server code, so the
// "server-only" package acts the same way it would in the browser: it throws.
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("server-only");
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("server database connection", () => {
  it("fails to load outside server code (like in the browser)", async () => {
    await expect(import("@/lib/db/client")).rejects.toThrow(
      /cannot be imported from a Client Component/,
    );
  });

  it("gives a clear error when SUPABASE_SERVICE_ROLE_KEY is missing", async () => {
    // Pretend we're in server code so the file can load.
    vi.doMock("server-only", () => ({}));
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const { getServerDb } = await import("@/lib/db/client");

    expect(() => getServerDb()).toThrow(/SUPABASE_SERVICE_ROLE_KEY is not set/);
  });
});
