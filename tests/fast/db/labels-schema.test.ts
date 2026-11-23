// T007: the label tables' rules hold in the database itself.
//
// Needs the local Supabase database (`npx supabase start`). fast-tests starts it
// on GitHub. These tests never skip: if the database isn't running, they fail.
//
// Each test runs inside a transaction that first clears the label tables, then is
// rolled back at the end. So the tests pass whether or not `npm run db:seed` has
// loaded real labels, and the seeded labels come back untouched afterward.
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
  // Start each test from empty label tables (sections first, since they point at
  // labels). The rollback in afterEach puts any seeded rows back.
  await db.query("delete from public.label_sections");
  await db.query("delete from public.drug_labels");
});
afterEach(async () => {
  await db.query("rollback");
});

async function addLabel(drug: string, isCurrent: boolean): Promise<string> {
  const result = await db.query<{ id: string }>(
    `insert into public.drug_labels (drug, set_id, label_date, raw_record, is_current)
     values ($1, 'test-set-id', '2026-01-01', '{}'::jsonb, $2)
     returning id`,
    [drug, isCurrent],
  );
  return result.rows[0]!.id;
}

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

describe("drug_labels", () => {
  it("rejects a second current label for the same drug", async () => {
    await addLabel("emgality", true);
    const code = await failingQuery(
      `insert into public.drug_labels (drug, set_id, label_date, raw_record, is_current)
       values ('emgality', 'test-set-id', '2026-02-01', '{}'::jsonb, true)`,
    );
    expect(code).toBe("23505"); // unique_violation
  });

  it("allows one current label per drug, plus old versions", async () => {
    await addLabel("emgality", true);
    await addLabel("emgality", false);
    await addLabel("reyvow", true);
    const result = await db.query("select count(*)::int as n from public.drug_labels");
    expect(result.rows[0].n).toBe(3);
  });

  it("rejects a drug other than emgality or reyvow", async () => {
    const code = await failingQuery(
      `insert into public.drug_labels (drug, set_id, label_date, raw_record)
       values ('advil', 'test-set-id', '2026-01-01', '{}'::jsonb)`,
    );
    expect(code).toBe("23514"); // check_violation
  });
});

describe("label_sections", () => {
  it("rejects empty section text", async () => {
    const labelId = await addLabel("reyvow", true);
    for (const text of ["", "   "]) {
      const code = await failingQuery(
        `insert into public.label_sections (label_id, field_key, display_name, text)
         values ($1, 'warnings_and_cautions', 'Warnings and Precautions', $2)`,
        [labelId, text],
      );
      expect(code).toBe("23514"); // check_violation
    }
  });
});

describe("server-only access", () => {
  for (const role of ["anon", "authenticated"]) {
    for (const table of ["drug_labels", "label_sections"]) {
      it(`blocks the ${role} role from reading ${table}`, async () => {
        await db.query(`set local role ${role}`);
        const code = await failingQuery(`select * from public.${table}`);
        expect(code).toBe("42501"); // insufficient_privilege
        await db.query("reset role");
      });
    }
  }
});
