// scripts/writer-login-check.mjs (quickstart section 9, step 7): it builds the same
// connection string as the AI_TESTS_DATABASE_URL secret, and its 8 checks come out
// as expected against the real ai_tests_writer role, so a future edit can't
// silently break the check.
//
// Needs the local Supabase database (`npx supabase start`). fast-tests starts it
// on GitHub. These tests never skip: if the database isn't running, they fail.
//
// The local ai_tests_writer role gets a throwaway password made while the test runs
// (never printed), so the script can log in as it. That has to be saved for real
// (a separate login can't see it otherwise), so afterward the practice rows are
// deleted and the role's login is turned off again, even if a test fails.
import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Local Supabase's fixed, public default address. Not a secret: it only works on
// this computer or the GitHub runner, and the online database never uses it.
const LOCAL_DB_URL =
  process.env.LOCAL_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// The script is plain JavaScript and TypeScript isn't set up to read JavaScript
// files, so it is loaded by a path held in a variable (TypeScript doesn't follow it).
const SCRIPT_PATH = "../../../scripts/writer-login-check.mjs";
type Target = { user: string; host: string; port: number; database: string; query: string };
type CheckModule = {
  buildUrl: (password: string, target?: Target) => string;
  runChecks: (db: pg.Client, log?: (message: string) => void) => Promise<boolean>;
  PRACTICE_COMMIT: string;
  PRACTICE_BRANCH: string;
};

const admin = new pg.Client({ connectionString: LOCAL_DB_URL });
const password = randomBytes(24).toString("hex"); // 48 letters and numbers
let script: CheckModule;

beforeAll(async () => {
  script = (await import(/* @vite-ignore */ SCRIPT_PATH)) as CheckModule;
  await admin.connect();
  await admin.query(
    `alter role ai_tests_writer with login password ${admin.escapeLiteral(password)}`,
  );
});

afterAll(async () => {
  try {
    await admin.query("delete from public.test_runs where branch = $1", [script.PRACTICE_BRANCH]);
    await admin.query("alter role ai_tests_writer with nologin password null");
  } finally {
    await admin.end();
  }
});

describe("scripts/writer-login-check.mjs", () => {
  it("builds exactly the AI_TESTS_DATABASE_URL template", () => {
    const fake = "A".repeat(48);
    expect(script.buildUrl(fake)).toBe(
      `postgresql://ai_tests_writer.zduoraqwelcbpzwtzvol:${fake}` +
        "@aws-0-us-east-1.pooler.supabase.com:5432/postgres" +
        "?sslmode=verify-full&sslrootcert=supabase/certs/supabase-root-2021.crt",
    );
  });

  it("all 8 checks come out as expected against the real role, with a practice-safe row", async () => {
    const url = new URL(LOCAL_DB_URL);
    const db = new pg.Client({
      connectionString: script.buildUrl(password, {
        user: "ai_tests_writer",
        host: url.hostname,
        port: Number(url.port),
        database: url.pathname.slice(1),
        query: "",
      }),
    });
    await db.connect();
    const lines: string[] = [];
    let ok: boolean;
    try {
      ok = await script.runChecks(db, (message) => lines.push(message));
    } finally {
      await db.end();
    }
    expect(ok).toBe(true);
    expect(lines.filter((line) => line.startsWith("OK "))).toHaveLength(8);
    expect(lines.some((line) => line.startsWith("PROBLEM"))).toBe(false);

    const { rows } = await admin.query(
      "select commit_sha, branch from public.test_runs where branch = $1",
      [script.PRACTICE_BRANCH],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toEqual({ commit_sha: "0".repeat(40), branch: "practice-writer-check" });
    }
  });
});
