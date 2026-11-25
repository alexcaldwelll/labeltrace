// T073: the ai_tests_writer login can only add 'running' test_runs rows and finish
// them through public.finish_test_run() (supabase/migrations/0004_ai_tests_writer.sql).
//
// Needs the local Supabase database (`npx supabase start`). fast-tests starts it
// on GitHub. These tests never skip: if the database isn't running, they fail.
//
// Each test runs inside a transaction that is rolled back, so nothing is left
// behind. The tests act as the writer with `set local role`, so the role never
// needs a login or a password here. To be allowed to do that, the test's admin
// user is made a member of the writer role inside the same transaction, so that
// is undone too.
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Local Supabase's fixed, public default address. Not a secret: it only works on
// this computer or the GitHub runner, and the online database never uses it.
const LOCAL_DB_URL =
  process.env.LOCAL_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const FINISH = "public.finish_test_run(uuid, integer, integer, integer, text)";

const db = new pg.Client({ connectionString: LOCAL_DB_URL });

beforeAll(async () => {
  await db.connect();
});
afterAll(async () => {
  await db.end();
});
beforeEach(async () => {
  await db.query("begin");
  await db.query("grant ai_tests_writer to current_user");
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

function actAsWriter() {
  return db.query("set local role ai_tests_writer");
}
function actAsAdmin() {
  return db.query("reset role");
}

// Adds a 'running' row the way the recorder does, and returns its id.
async function addRunningRow(): Promise<string> {
  const id = randomUUID();
  await db.query(
    `insert into public.test_runs
       (id, commit_sha, branch, answer_model, grader_model, started_at, status)
     values ($1, 'abc123', 'test-branch', 'claude-haiku-5-5', 'test-grader', now(), 'running')`,
    [id],
  );
  return id;
}

function finish(id: string, passed: number, failed: number, total: number, status: string) {
  return {
    sql: "select public.finish_test_run($1, $2, $3, $4, $5)",
    params: [id, passed, failed, total, status],
  };
}

describe("ai_tests_writer: what it may do", () => {
  it("adds a 'running' row and finishes it", async () => {
    await actAsWriter();
    const id = await addRunningRow();
    const f = finish(id, 1, 0, 1, "passed");
    await db.query(f.sql, f.params);

    await actAsAdmin();
    const { rows } = await db.query(
      "select status, passed, failed, total, finished_at from public.test_runs where id = $1",
      [id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "passed", passed: 1, failed: 0, total: 1 });
    expect(rows[0].finished_at).not.toBeNull();
  });
});

describe("ai_tests_writer: what it may not do", () => {
  it("can't add a row that is already 'passed'", async () => {
    await actAsWriter();
    const code = await failingQuery(
      `insert into public.test_runs (id, answer_model, grader_model, status)
       values ($1, 'claude-haiku-5-5', 'test-grader', 'passed')`,
      [randomUUID()],
    );
    expect(code).toBe("42501"); // blocked by the Row Level Security rule
  });

  it("can't fill in the counts when adding a row", async () => {
    await actAsWriter();
    const code = await failingQuery(
      `insert into public.test_runs (id, answer_model, grader_model, status, passed, total)
       values ($1, 'claude-haiku-5-5', 'test-grader', 'running', 1, 1)`,
      [randomUUID()],
    );
    expect(code).toBe("42501"); // insufficient_privilege
  });

  it("can't change a row directly", async () => {
    const id = await addRunningRow();
    await actAsWriter();
    const code = await failingQuery("update public.test_runs set status = 'passed' where id = $1", [
      id,
    ]);
    expect(code).toBe("42501");
  });

  it("can't delete a row", async () => {
    const id = await addRunningRow();
    await actAsWriter();
    const code = await failingQuery("delete from public.test_runs where id = $1", [id]);
    expect(code).toBe("42501");
  });

  for (const table of ["test_runs", "log_entries"]) {
    it(`can't read ${table}`, async () => {
      await actAsWriter();
      const code = await failingQuery(`select * from public.${table}`);
      expect(code).toBe("42501");
    });
  }

  it("refuses to finish a row that is already finished", async () => {
    await actAsWriter();
    const id = await addRunningRow();
    const first = finish(id, 0, 1, 1, "failed");
    await db.query(first.sql, first.params);

    // Trying to flip the finished 'failed' run to 'passed'.
    const second = finish(id, 1, 0, 1, "passed");
    const code = await failingQuery(second.sql, second.params);
    expect(code).toBe("P0002"); // no running row with that id

    await actAsAdmin();
    const { rows } = await db.query("select status from public.test_runs where id = $1", [id]);
    expect(rows[0].status).toBe("failed");
  });

  it("refuses to finish a row with status 'running'", async () => {
    await actAsWriter();
    const id = await addRunningRow();
    const f = finish(id, 1, 0, 1, "running");
    expect(await failingQuery(f.sql, f.params)).toBe("22023");
  });

  for (const role of ["anon", "authenticated"]) {
    it(`the ${role} role can't run finish_test_run`, async () => {
      const id = await addRunningRow();
      await db.query(`set local role ${role}`);
      const f = finish(id, 1, 0, 1, "passed");
      expect(await failingQuery(f.sql, f.params)).toBe("42501");
    });
  }
});

describe("finish_test_run: number checks (X1)", () => {
  const cases: [string, number, number, number, string][] = [
    ["passed + failed must equal total", 1, 0, 2, "failed"],
    ["a passed run can't have failures", 1, 1, 2, "passed"],
    ["a passed run needs at least 1 test", 0, 0, 0, "passed"],
    ["counts can't be below 0", -1, 1, 0, "failed"],
  ];
  for (const [name, passed, failed, total, status] of cases) {
    it(`refuses: ${name}`, async () => {
      await actAsWriter();
      const id = await addRunningRow();
      const f = finish(id, passed, failed, total, status);
      expect(await failingQuery(f.sql, f.params)).toBe("22023");
    });
  }

  it("accepts a failed run with 0 tests (nothing ran)", async () => {
    await actAsWriter();
    const id = await addRunningRow();
    const f = finish(id, 0, 0, 0, "failed");
    await db.query(f.sql, f.params);
  });
});

describe("finish_test_run: how it is set up", () => {
  it("runs as SECURITY DEFINER with search_path fixed to public, pg_temp", async () => {
    const { rows } = await db.query(
      "select prosecdef, proconfig from pg_proc where oid = $1::regprocedure",
      [FINISH],
    );
    expect(rows[0].prosecdef).toBe(true);
    expect(rows[0].proconfig).toEqual(["search_path=public, pg_temp"]);
  });

  it("can't be run by PUBLIC, anon, or authenticated, and can be run by the writer", async () => {
    const { rows } = await db.query(
      `select
         exists (
           select 1 from pg_proc p, aclexplode(p.proacl) a
           where p.oid = $1::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'
         ) as public_can,
         has_function_privilege('anon', $1, 'execute') as anon_can,
         has_function_privilege('authenticated', $1, 'execute') as authenticated_can,
         has_function_privilege('ai_tests_writer', $1, 'execute') as writer_can`,
      [FINISH],
    );
    expect(rows[0]).toEqual({
      public_can: false,
      anon_can: false,
      authenticated_can: false,
      writer_can: true,
    });
  });
});
