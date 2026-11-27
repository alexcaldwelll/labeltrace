// T071 step 2: the ai_gate_reader login can only read test_runs
// (supabase/migrations/0005_ai_gate_reader.sql).
//
// Needs the local Supabase database (`npx supabase start`). fast-tests starts it
// on GitHub. These tests never skip: if the database isn't running, they fail.
//
// Each test runs inside a transaction that is rolled back, so nothing is left
// behind. The tests act as the reader with `set local role`, so the role never
// needs a login or a password here. To be allowed to do that, the test's admin
// user is made a member of the reader role inside the same transaction, so that
// is undone too.
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DB_PERMISSIONS_LOCK } from "../../helpers/db-permissions-lock";

// Local Supabase's fixed, public default address. Not a secret: it only works on
// this computer or the GitHub runner, and the online database never uses it.
const LOCAL_DB_URL =
  process.env.LOCAL_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const db = new pg.Client({ connectionString: LOCAL_DB_URL });

beforeAll(async () => {
  await db.connect();
});
afterAll(async () => {
  await db.end();
});
beforeEach(async () => {
  await db.query("begin");
  // One permission-changing transaction at a time (tests/helpers/db-permissions-lock.ts).
  await db.query(DB_PERMISSIONS_LOCK);
  await db.query("grant ai_gate_reader to current_user");
});
afterEach(async () => {
  await db.query("rollback");
});

// Runs a query that should fail, inside a savepoint so the test's transaction
// stays usable. Returns the Postgres error code.
async function failingQuery(sql: string, params: unknown[] = []): Promise<string> {
  await db.query("savepoint expect_fail");
  try {
    await db.query(sql, params);
  } catch (error) {
    await db.query("rollback to savepoint expect_fail");
    return (error as { code: string }).code;
  }
  throw new Error(`Expected this query to fail, but it worked: ${sql}`);
}

function actAsReader() {
  return db.query("set local role ai_gate_reader");
}

// Adds a finished, passed run as the admin, and returns its id.
async function addPassedRun(): Promise<string> {
  const id = randomUUID();
  await db.query(
    `insert into public.test_runs
       (id, commit_sha, branch, answer_model, grader_model, status, passed, failed, total)
     values ($1, 'abc123', 'test-branch', 'claude-haiku-5-5', 'test-grader', 'passed', 1, 0, 1)`,
    [id],
  );
  return id;
}

describe("ai_gate_reader: what it may do", () => {
  it("reads a test_runs row (the row rule lets it see rows, not just the table)", async () => {
    const id = await addPassedRun();
    await actAsReader();
    const { rows } = await db.query(
      "select status, commit_sha, answer_model, grader_model from public.test_runs where id = $1",
      [id],
    );
    expect(rows).toEqual([
      {
        status: "passed",
        commit_sha: "abc123",
        answer_model: "claude-haiku-5-5",
        grader_model: "test-grader",
      },
    ]);
  });
});

describe("ai_gate_reader: what it may not do", () => {
  it("can't add a test_runs row", async () => {
    await actAsReader();
    const code = await failingQuery(
      `insert into public.test_runs (id, answer_model, grader_model, status)
       values ($1, 'claude-haiku-5-5', 'test-grader', 'passed')`,
      [randomUUID()],
    );
    expect(code).toBe("42501");
  });

  it("can't change a test_runs row", async () => {
    const id = await addPassedRun();
    await actAsReader();
    const code = await failingQuery("update public.test_runs set status = 'failed' where id = $1", [
      id,
    ]);
    expect(code).toBe("42501");
  });

  it("can't delete a test_runs row", async () => {
    const id = await addPassedRun();
    await actAsReader();
    const code = await failingQuery("delete from public.test_runs where id = $1", [id]);
    expect(code).toBe("42501");
  });

  for (const table of ["log_entries", "drug_labels", "label_sections"]) {
    it(`can't read ${table}`, async () => {
      await actAsReader();
      const code = await failingQuery(`select * from public.${table} limit 1`);
      expect(code).toBe("42501");
    });
  }

  it("can't run finish_test_run", async () => {
    await actAsReader();
    const code = await failingQuery("select public.finish_test_run($1, 1, 0, 1, 'passed')", [
      randomUUID(),
    ]);
    expect(code).toBe("42501");
  });

  it("can't run get_current_label", async () => {
    await actAsReader();
    const code = await failingQuery("select public.get_current_label('reyvow')");
    expect(code).toBe("42501");
  });
});
