// T051: who can read the question log, and the review tables' rules, hold in the
// database itself (supabase/migrations/0006_reviewers.sql; FR-029, FR-031, FR-032).
//
// Needs the local Supabase database (`npx supabase start`). fast-tests starts it on
// GitHub. Each test runs inside a transaction that is rolled back, so nothing is left
// behind. A test acts as a signed-in user by adding a made-up login (auth.users), then
// switching to the `authenticated` role with that login's ID, the way Supabase does
// for a signed-in request. Only the CI-login test grants a role, so only it takes the
// shared permissions lock (tests/helpers/db-permissions-lock.ts).
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

/** Adds a made-up login and, if a role is given, its reviewers row. Returns its ID. */
async function addPerson(role?: "reviewer" | "owner", active = true): Promise<string> {
  const id = randomUUID();
  await db.query("insert into auth.users (id) values ($1)", [id]);
  if (role) {
    await db.query(
      "insert into public.reviewers (user_id, display_name, role, active) values ($1, $2, $3, $4)",
      [id, `Test ${role}`, role, active],
    );
  }
  return id;
}

/** A log row with no question (the simplest valid row). Returns its ID. */
async function addLogRow(): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into public.log_entries (answer_type) values ('prompt_for_question') returning id",
  );
  return rows[0]!.id;
}

/** Acts as a signed-in user for the rest of the transaction. */
async function signInAs(userId: string): Promise<void> {
  await db.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  await db.query("set local role authenticated");
}

/** How many log rows the current role can see. */
async function visibleLogRows(): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    "select count(*)::int as n from public.log_entries",
  );
  return rows[0]!.n;
}

describe("who can read log_entries (FR-029)", () => {
  it("the anonymous client can't read it", async () => {
    await addLogRow();
    await db.query("set local role anon");
    expect(await failingQuery("select * from public.log_entries")).toBe("42501");
  });

  it("an inactive reviewer can't see any rows", async () => {
    const id = await addPerson("reviewer", false);
    await addLogRow();
    await signInAs(id);
    expect(await visibleLogRows()).toBe(0);
  });

  it("an active reviewer can", async () => {
    const id = await addPerson("reviewer");
    await addLogRow();
    await signInAs(id);
    expect(await visibleLogRows()).toBeGreaterThanOrEqual(1);
  });

  // Owner-approved (2026-11-27, detail 6).
  it("an active owner can", async () => {
    const id = await addPerson("owner");
    await addLogRow();
    await signInAs(id);
    expect(await visibleLogRows()).toBeGreaterThanOrEqual(1);
  });
});

describe("review_decisions rules (FR-032)", () => {
  it("a flag with no reason is rejected", async () => {
    const reviewer = await addPerson("reviewer");
    const log = await addLogRow();
    const code = await failingQuery(
      "insert into public.review_decisions (log_entry_id, reviewer_id, decision) values ($1, $2, 'flag')",
      [log, reviewer],
    );
    expect(code).toBe("23514");
  });

  // Owner-approved (2026-11-27, detail 6).
  it("a flag with a blank reason is rejected", async () => {
    const reviewer = await addPerson("reviewer");
    const log = await addLogRow();
    const code = await failingQuery(
      "insert into public.review_decisions (log_entry_id, reviewer_id, decision, reason) values ($1, $2, 'flag', '  ')",
      [log, reviewer],
    );
    expect(code).toBe("23514");
  });

  // Owner-approved extra (2026-11-27): the database sets decided_at.
  it("the database sets decided_at", async () => {
    const reviewer = await addPerson("reviewer");
    const log = await addLogRow();
    const { rows } = await db.query<{ decided_at: Date | null }>(
      "insert into public.review_decisions (log_entry_id, reviewer_id, decision) values ($1, $2, 'approve') returning decided_at",
      [log, reviewer],
    );
    expect(rows[0]!.decided_at).toBeInstanceOf(Date);
  });

  // Owner-approved (2026-11-27, detail 6).
  it("an approve with no reason is accepted", async () => {
    const reviewer = await addPerson("reviewer");
    const log = await addLogRow();
    const { rowCount } = await db.query(
      "insert into public.review_decisions (log_entry_id, reviewer_id, decision) values ($1, $2, 'approve')",
      [log, reviewer],
    );
    expect(rowCount).toBe(1);
  });
});

describe("reviewers rules", () => {
  // Owner's decision (2026-11-27, detail 5); test owner-approved as an extra.
  it("allows at most one owner", async () => {
    await addPerson("owner");
    const second = randomUUID();
    await db.query("insert into auth.users (id) values ($1)", [second]);
    const code = await failingQuery(
      "insert into public.reviewers (user_id, role, active) values ($1, 'owner', true)",
      [second],
    );
    expect(code).toBe("23505");
  });

  // Owner-approved (2026-11-27, detail 6).
  it("a signed-in user can't add or change a reviewers row, including their own role", async () => {
    const id = await addPerson("reviewer");
    const other = await addPerson();
    await signInAs(id);
    expect(
      await failingQuery("update public.reviewers set role = 'owner' where user_id = $1", [id]),
    ).toBe("42501");
    expect(
      await failingQuery(
        "insert into public.reviewers (user_id, role, active) values ($1, 'reviewer', true)",
        [other],
      ),
    ).toBe("42501");
  });

  // Owner-approved (2026-11-27, detail 6).
  it("a signed-in user sees only their own reviewers row", async () => {
    const me = await addPerson("reviewer");
    await addPerson("reviewer");
    await signInAs(me);
    const { rows } = await db.query<{ user_id: string }>("select user_id from public.reviewers");
    expect(rows.map((row) => row.user_id)).toEqual([me]);
  });
});

// Owner-approved extra (2026-11-27): saving decisions is T053.
describe("review_decisions through the API", () => {
  it("a signed-in user can't use it yet (T053)", async () => {
    const id = await addPerson("reviewer");
    await signInAs(id);
    expect(await failingQuery("select * from public.review_decisions")).toBe("42501");
  });
});

// Owner-approved (2026-11-27, detail 6).
describe("the CI logins still can't read the review tables or the log", () => {
  it.each(["ai_gate_reader", "ai_tests_writer"])("%s", async (role) => {
    // Acting as the role needs it granted for this transaction, so take the shared lock.
    await db.query(DB_PERMISSIONS_LOCK);
    await db.query(`grant ${role} to current_user`);
    await db.query(`set local role ${role}`);
    for (const table of ["reviewers", "review_decisions", "log_entries"]) {
      expect(await failingQuery(`select * from public.${table}`), table).toBe("42501");
    }
  });
});
