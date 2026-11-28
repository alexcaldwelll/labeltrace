// T055: the grader tables' rules hold in the database itself
// (supabase/migrations/0007_grader.sql; FR-037, FR-038; owner's decision 1A, 2026-11-27).
//
// Needs the local Supabase database (`npx supabase start`). fast-tests starts it on
// GitHub. Each test runs inside a transaction that is rolled back, so nothing is left
// behind. A test acts as a signed-in user the same way as review-rls.test.ts. These
// tests grant no roles, so they don't need the shared permissions lock.
import { randomUUID } from "node:crypto";

import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

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
});
afterEach(async () => {
  await db.query("rollback");
});

/** Runs a query that should fail, inside a savepoint. Returns the Postgres error code. */
async function failingQuery(sql: string, params: unknown[] = []): Promise<string> {
  await db.query("savepoint expect_fail");
  try {
    await db.query(sql, params);
  } catch (error) {
    await db.query("rollback to savepoint expect_fail");
    return (error as { code: string }).code;
  }
  await db.query("release savepoint expect_fail");
  throw new Error(`Expected this query to fail: ${sql}`);
}

/** Adds a made-up login and its reviewers row. Returns its ID. */
async function addPerson(role: "reviewer" | "owner", active = true): Promise<string> {
  const id = randomUUID();
  await db.query("insert into auth.users (id) values ($1)", [id]);
  await db.query(
    "insert into public.reviewers (user_id, display_name, role, active) values ($1, $2, $3, $4)",
    [id, `Test ${role}`, role, active],
  );
  return id;
}

/** Adds a finished test run. Returns its ID. */
async function addRun(): Promise<string> {
  const id = randomUUID();
  await db.query(
    `insert into public.test_runs (id, commit_sha, branch, answer_model, grader_model, status, passed, failed, total)
     values ($1, 'abc123', 'test-branch', 'claude-haiku-5-5', 'test-grader', 'passed', 1, 0, 1)`,
    [id],
  );
  return id;
}

/** Adds a test-answer grade. Returns its ID. */
async function addTestGrade(grade: "pass" | "fail"): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.grader_results
       (source, test_run_id, test_entry_id, scrubbed_question, answer, grader_model, grade, grader_reason)
     values ('test', $1, 'refusals-001', 'Is Reyvow better than Imitrex?', 'I can''t compare medicines.', 'test-grader', $2, 'reason')
     returning id`,
    [await addRun(), grade],
  );
  return rows[0]!.id;
}

/** Adds the owner's decision on a grade, as the admin. */
function decide(graderResultId: string, ownerId: string, reason: string | null = "Looks right.") {
  return db.query(
    `insert into public.owner_flag_decisions (grader_result_id, owner_id, agrees_with_grader, reason)
     values ($1, $2, true, $3)`,
    [graderResultId, ownerId, reason],
  );
}

/** Acts as a signed-in user for the rest of the transaction. */
async function signInAs(userId: string): Promise<void> {
  await db.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  await db.query("set local role authenticated");
}

describe("owner_flag_decisions rules (T055)", () => {
  it("a second decision on the same flag is rejected", async () => {
    const owner = await addPerson("owner");
    const flag = await addTestGrade("fail");
    await decide(flag, owner);
    expect(
      await failingQuery(
        `insert into public.owner_flag_decisions (grader_result_id, owner_id, agrees_with_grader, reason)
         values ($1, $2, false, 'Changed my mind.')`,
        [flag, owner],
      ),
    ).toBe("23505");
  });

  it("a reviewer (not the owner) can't add a decision", async () => {
    const reviewer = await addPerson("reviewer");
    const flag = await addTestGrade("fail");
    await signInAs(reviewer);
    // Refused either by the owner check (23514; the trigger runs first) or by the
    // access rule (42501).
    const code = await failingQuery(
      `insert into public.owner_flag_decisions (grader_result_id, owner_id, agrees_with_grader, reason)
       values ($1, $2, true, 'Looks right.')`,
      [flag, reviewer],
    );
    expect(["23514", "42501"]).toContain(code);
    await db.query("reset role");
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.owner_flag_decisions where grader_result_id = $1",
      [flag],
    );
    expect(rows[0]!.n).toBe(0);
  });

  it("a decision with no reason is rejected", async () => {
    const owner = await addPerson("owner");
    const flag = await addTestGrade("fail");
    expect(
      await failingQuery(
        `insert into public.owner_flag_decisions (grader_result_id, owner_id, agrees_with_grader)
         values ($1, $2, true)`,
        [flag, owner],
      ),
    ).toBe("23502");
  });
});

// Owner-approved extras (2026-11-27, detail 8).
describe("grader rules (extras)", () => {
  it("needs_owner_decision follows the grade", async () => {
    const fail = await addTestGrade("fail");
    const pass = await addTestGrade("pass");
    const { rows } = await db.query<{ id: string; needs_owner_decision: boolean }>(
      "select id, needs_owner_decision from public.grader_results where id = any($1)",
      [[fail, pass]],
    );
    const byId = Object.fromEntries(rows.map((row) => [row.id, row.needs_owner_decision]));
    expect(byId).toEqual({ [fail]: true, [pass]: false });
  });

  it("a decision on a passing grade is rejected", async () => {
    const owner = await addPerson("owner");
    const pass = await addTestGrade("pass");
    expect(
      await failingQuery(
        `insert into public.owner_flag_decisions (grader_result_id, owner_id, agrees_with_grader, reason)
         values ($1, $2, true, 'Looks right.')`,
        [pass, owner],
      ),
    ).toBe("23514");
  });

  it("a reviewer can't read either table, but the active owner can", async () => {
    const owner = await addPerson("owner");
    const reviewer = await addPerson("reviewer");
    const flag = await addTestGrade("fail");
    await decide(flag, owner);
    const counts = async () => {
      const grades = await db.query<{ n: number }>(
        "select count(*)::int as n from public.grader_results",
      );
      const decisions = await db.query<{ n: number }>(
        "select count(*)::int as n from public.owner_flag_decisions",
      );
      return [grades.rows[0]!.n, decisions.rows[0]!.n];
    };
    await signInAs(reviewer);
    expect(await counts()).toEqual([0, 0]);
    await db.query("reset role");
    await signInAs(owner);
    const [grades, decisions] = await counts();
    expect(grades).toBeGreaterThanOrEqual(1);
    expect(decisions).toBeGreaterThanOrEqual(1);
  });

  it("nobody can change or delete a decision through the API", async () => {
    const owner = await addPerson("owner");
    const flag = await addTestGrade("fail");
    await decide(flag, owner);
    await signInAs(owner);
    expect(
      await failingQuery(
        "update public.owner_flag_decisions set reason = 'edited' where grader_result_id = $1",
        [flag],
      ),
    ).toBe("42501");
    expect(
      await failingQuery("delete from public.owner_flag_decisions where grader_result_id = $1", [
        flag,
      ]),
    ).toBe("42501");
  });

  it("a test row without test_run_id, or a real row without log_entry_id, is rejected", async () => {
    expect(
      await failingQuery(
        `insert into public.grader_results (source, test_entry_id, scrubbed_question, answer, grader_model, grade)
         values ('test', 'refusals-001', 'q', 'a', 'test-grader', 'pass')`,
      ),
    ).toBe("23514");
    expect(
      await failingQuery(
        `insert into public.grader_results (source, grader_model, grade)
         values ('real', 'test-grader', 'pass')`,
      ),
    ).toBe("23514");
  });
});
