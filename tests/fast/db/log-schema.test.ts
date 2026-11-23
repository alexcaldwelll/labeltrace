// T008: the audit log and test-run tables' rules hold in the database itself.
//
// Needs the local Supabase database (`npx supabase start`). fast-tests starts it
// on GitHub. These tests never skip: if the database isn't running, they fail.
//
// Each test runs inside a transaction that is rolled back, so nothing is left
// behind in the database.
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

// A made-up, already-scrubbed question. No real patient data.
const QUESTION = "What are the side effects of Reyvow?";

// Inserts a log row with a question, overriding any fields given.
function insertQuestionRow(overrides: Record<string, unknown> = {}) {
  const row: Record<string, unknown> = {
    scrubbed_question: QUESTION,
    answer_type: "normal",
    answer: "The label lists dizziness.",
    source: "real",
    review_status: "not_reviewed",
    ...overrides,
  };
  const columns = Object.keys(row);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  return {
    sql: `insert into public.log_entries (${columns.join(", ")})
          values (${placeholders.join(", ")})`,
    params: Object.values(row),
  };
}

describe("log_entries", () => {
  it("accepts a normal row with a question", async () => {
    const { sql, params } = insertQuestionRow();
    await db.query(sql, params);
  });

  it("rejects a bad answer_type", async () => {
    const { sql, params } = insertQuestionRow({ answer_type: "maybe" });
    expect(await failingQuery(sql, params)).toBe("23514"); // check_violation
  });

  it("rejects grading_attempts = 6", async () => {
    const { sql, params } = insertQuestionRow({ grading_attempts: 6 });
    expect(await failingQuery(sql, params)).toBe("23514");
  });

  it("rejects a misspelled grading_status", async () => {
    const { sql, params } = insertQuestionRow({ grading_status: "not_aplicable" });
    expect(await failingQuery(sql, params)).toBe("23514");
  });

  it("rejects a row with a question but no review_status (no default)", async () => {
    const code = await failingQuery(
      `insert into public.log_entries (scrubbed_question, answer_type, answer, source)
       values ($1, 'normal', 'The label lists dizziness.', 'real')`,
      [QUESTION],
    );
    expect(code).toBe("23514");
  });

  it("rejects a row with no question but a source filled in", async () => {
    const code = await failingQuery(
      `insert into public.log_entries (answer_type, source) values ('english_only', 'real')`,
    );
    expect(code).toBe("23514");
  });

  it("rejects a row with no question but an answer filled in", async () => {
    const code = await failingQuery(
      `insert into public.log_entries (answer_type, answer)
       values ('prompt_for_question', 'Please type a question.')`,
    );
    expect(code).toBe("23514");
  });

  it("accepts a row with only id, created_at, and answer_type", async () => {
    const result = await db.query<{ id: string; created_at: Date }>(
      `insert into public.log_entries (answer_type) values ('english_only')
       returning id, created_at`,
    );
    // id and created_at are filled in by the database.
    expect(result.rows[0]!.id).toBeTruthy();
    expect(result.rows[0]!.created_at).toBeInstanceOf(Date);
  });

  it("has no column that could hold the raw question", async () => {
    const result = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'log_entries'`,
    );
    const columns = result.rows.map((r) => r.column_name);
    expect(columns).toContain("scrubbed_question");
    expect(columns.filter((c) => c.includes("question"))).toEqual(["scrubbed_question"]);
  });

  it("has no column defaults except id and created_at", async () => {
    const result = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'log_entries'
         and column_default is not null`,
    );
    expect(result.rows.map((r) => r.column_name).sort()).toEqual(["created_at", "id"]);
  });
});

describe("test_runs", () => {
  it("accepts status = 'incomplete'", async () => {
    await db.query(
      `insert into public.test_runs (answer_model, grader_model, status)
       values ('claude-haiku-5-5', 'test-grader', 'incomplete')`,
    );
  });

  it("rejects a row with no grader_model", async () => {
    const code = await failingQuery(
      `insert into public.test_runs (answer_model, status)
       values ('claude-haiku-5-5', 'running')`,
    );
    expect(code).toBe("23502"); // not_null_violation
  });

  it("rejects a pointer_rate above 1", async () => {
    const code = await failingQuery(
      `insert into public.test_runs (answer_model, grader_model, status, pointer_rate)
       values ('claude-haiku-5-5', 'test-grader', 'passed', 1.5)`,
    );
    expect(code).toBe("23514");
  });
});

describe("server-only access", () => {
  for (const role of ["anon", "authenticated"]) {
    for (const table of ["log_entries", "test_runs"]) {
      it(`blocks the ${role} role from reading ${table}`, async () => {
        await db.query(`set local role ${role}`);
        const code = await failingQuery(`select * from public.${table}`);
        expect(code).toBe("42501"); // insufficient_privilege
        await db.query("reset role");
      });
    }
  }
});
