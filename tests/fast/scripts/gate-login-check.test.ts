// scripts/gate-login-check.mjs (quickstart section 9, step 6): it builds the same
// connection string as the AI_GATE_DATABASE_URL secret, its 7 checks come out as
// expected against the real ai_gate_reader role, and it catches a missing row rule,
// so a future edit can't silently break the check.
//
// Needs the local Supabase database (`npx supabase start`). fast-tests starts it
// on GitHub. These tests never skip: if the database isn't running, they fail.
//
// The local ai_gate_reader role gets a throwaway password made while the test runs
// (never printed), so the script can log in as it. That has to be saved for real
// (a separate login can't see it otherwise), so afterward the role's login is
// turned off again, even if a test fails.
import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_PERMISSIONS_LOCK } from "../../helpers/db-permissions-lock";

// Local Supabase's fixed, public default address. Not a secret: it only works on
// this computer or the GitHub runner, and the online database never uses it.
const LOCAL_DB_URL =
  process.env.LOCAL_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// The script is plain JavaScript and TypeScript isn't set up to read JavaScript
// files, so it is loaded by a path held in a variable (TypeScript doesn't follow it).
const SCRIPT_PATH = "../../../scripts/gate-login-check.mjs";
type Target = { user: string; host: string; port: number; database: string; query: string };
type CheckModule = {
  buildUrl: (password: string, target?: Target) => string;
  runChecks: (db: pg.Client, log?: (message: string) => void) => Promise<boolean>;
};

const admin = new pg.Client({ connectionString: LOCAL_DB_URL });
const password = randomBytes(24).toString("hex"); // 48 letters and numbers
let script: CheckModule;

beforeAll(async () => {
  script = (await import(/* @vite-ignore */ SCRIPT_PATH)) as CheckModule;
  await admin.connect();
  await admin.query(
    `alter role ai_gate_reader with login password ${admin.escapeLiteral(password)}`,
  );
});

afterAll(async () => {
  try {
    await admin.query("alter role ai_gate_reader with nologin password null");
  } finally {
    await admin.end();
  }
});

describe("scripts/gate-login-check.mjs", () => {
  it("builds exactly the AI_GATE_DATABASE_URL template", () => {
    const fake = "A".repeat(48);
    expect(script.buildUrl(fake)).toBe(
      `postgresql://ai_gate_reader.zduoraqwelcbpzwtzvol:${fake}` +
        "@aws-0-us-east-1.pooler.supabase.com:5432/postgres" +
        "?sslmode=verify-full&sslrootcert=supabase/certs/supabase-root-2021.crt",
    );
  });

  it("all 7 checks come out as expected against the real role", async () => {
    const url = new URL(LOCAL_DB_URL);
    const db = new pg.Client({
      connectionString: script.buildUrl(password, {
        user: "ai_gate_reader",
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
    expect(lines.filter((line) => line.startsWith("OK "))).toHaveLength(7);
    expect(lines.some((line) => line.startsWith("PROBLEM"))).toBe(false);
  });

  it("reports a missing row rule (check 2) and fails the run", async () => {
    // Inside a transaction that is rolled back, so the rule comes back afterward.
    await admin.query("begin");
    try {
      // One permission-changing transaction at a time (tests/helpers/db-permissions-lock.ts).
      await admin.query(DB_PERMISSIONS_LOCK);
      await admin.query("drop policy test_runs_gate_reader_reads_all on public.test_runs");
      await admin.query("grant ai_gate_reader to current_user");
      await admin.query("set local role ai_gate_reader");
      const lines: string[] = [];
      const ok = await script.runChecks(admin, (message) => lines.push(message));
      expect(ok).toBe(false);
      expect(lines).toContain("PROBLEM  2. row rule for ai_gate_reader on test_runs: NOT found");
    } finally {
      await admin.query("rollback");
    }
    const { rows } = await admin.query(
      "select count(*)::int as n from pg_policies where policyname = 'test_runs_gate_reader_reads_all'",
    );
    expect(rows[0].n).toBe(1);
  });
});
