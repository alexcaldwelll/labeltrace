// T011: getting a drug's current saved label.
//
// Part 1 tests the database function get_current_label (0003) on the real local
// database. Needs local Supabase (`npx supabase start`); fast-tests starts it on
// GitHub. These tests never skip: if the database isn't running, they fail.
// Each test runs inside a transaction that first clears the label tables, loads the
// saved openFDA labels (tests/fixtures/openfda/), and is rolled back (undone) at the
// end. So the tests pass whether or not `npm run db:seed` has run, and real data
// comes back untouched afterward.
//
// Part 2 tests getCurrentLabel() in src/lib/labels/store.ts. Those tests run as
// plain code, not Next.js server code, so "server-only" is replaced by a stand-in
// inside each test (the same approach as T009's test), and the database connection
// is replaced by a stand-in that returns set replies.
import { readFileSync } from "node:fs";

import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { labelSections, SECTION_NAMES } from "@/lib/labels/sections";

// Local Supabase's fixed, public default address. Not a secret: it only works on
// this computer or the GitHub runner, and the online database never uses it.
const LOCAL_DB_URL =
  process.env.LOCAL_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

type Fixture = { setId: string; labelDate: string; record: Record<string, unknown> };

function readFixture(drug: "emgality" | "reyvow"): Fixture {
  const file = new URL(`../../fixtures/openfda/${drug}.json`, import.meta.url);
  const reply = JSON.parse(readFileSync(file, "utf8")) as { results: Record<string, unknown>[] };
  const record = reply.results[0]!;
  const t = record.effective_time as string;
  return {
    setId: record.set_id as string,
    labelDate: `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`,
    record,
  };
}

const emgality = readFixture("emgality");
const reyvow = readFixture("reyvow");

describe("get_current_label (database function)", () => {
  const db = new pg.Client({ connectionString: LOCAL_DB_URL });

  beforeAll(async () => {
    await db.connect();
  });
  afterAll(async () => {
    await db.end();
  });
  beforeEach(async () => {
    await db.query("begin");
    // Start from empty label tables (sections first, since they point at labels).
    // The rollback in afterEach puts any seeded rows back.
    await db.query("delete from public.label_sections");
    await db.query("delete from public.drug_labels");
  });
  afterEach(async () => {
    await db.query("rollback");
  });

  async function loadLabel(
    drug: "emgality" | "reyvow",
    fixture: Fixture,
    isCurrent: boolean,
  ): Promise<string> {
    const label = await db.query<{ id: string }>(
      `insert into public.drug_labels (drug, set_id, label_date, raw_record, is_current)
       values ($1, $2, $3, $4, $5)
       returning id`,
      [drug, fixture.setId, fixture.labelDate, fixture.record, isCurrent],
    );
    const labelId = label.rows[0]!.id;
    for (const s of labelSections(fixture.record)) {
      await db.query(
        `insert into public.label_sections (label_id, field_key, display_name, text)
         values ($1, $2, $3, $4)`,
        [labelId, s.field_key, s.display_name, s.text],
      );
    }
    return labelId;
  }

  async function getCurrent(drug: string): Promise<Record<string, unknown> | null> {
    const result = await db.query<{ label: Record<string, unknown> | null }>(
      "select public.get_current_label($1) as label",
      [drug],
    );
    return result.rows[0]!.label;
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

  it("returns the loaded label, its date, and all its sections", async () => {
    const emgalityId = await loadLabel("emgality", emgality, true);
    await loadLabel("reyvow", reyvow, true);

    const label = await getCurrent("emgality");

    expect(label).not.toBeNull();
    expect(label!.drug).toBe("emgality");
    expect(label!.label_id).toBe(emgalityId);
    expect(label!.set_id).toBe(emgality.setId);
    expect(label!.label_date).toBe(emgality.labelDate);
    const expected = labelSections(emgality.record);
    expect(label!.sections).toEqual(
      expect.arrayContaining(expected.map((s) => expect.objectContaining(s))),
    );
    expect(label!.sections).toHaveLength(expected.length);
  });

  it("returns only the current version, not an old one", async () => {
    await loadLabel("reyvow", { ...reyvow, labelDate: "2020-01-01" }, false);
    await loadLabel("reyvow", reyvow, true);

    const label = await getCurrent("reyvow");

    expect(label!.label_date).toBe(reyvow.labelDate);
  });

  it("returns NULL when the drug has no current label, not another drug's label", async () => {
    // Reyvow is current; Emgality only has an old version.
    await loadLabel("reyvow", reyvow, true);
    await loadLabel("emgality", emgality, false);

    expect(await getCurrent("emgality")).toBeNull();
  });

  it("returns NULL when the label tables are empty", async () => {
    expect(await getCurrent("emgality")).toBeNull();
    expect(await getCurrent("reyvow")).toBeNull();
  });

  for (const role of ["anon", "authenticated"]) {
    it(`blocks the ${role} role (browser) from calling it`, async () => {
      await db.query(`set local role ${role}`);
      const code = await failingQuery("select public.get_current_label('emgality')");
      expect(code).toBe("42501"); // insufficient_privilege
      await db.query("reset role");
    });
  }

  it("lets the service role (server code) call it", async () => {
    await loadLabel("emgality", emgality, true);
    await db.query("set local role service_role");
    const label = await getCurrent("emgality");
    await db.query("reset role");
    expect(label!.drug).toBe("emgality");
  });
});

describe("getCurrentLabel", () => {
  // Stand-in database connection: rpc() returns whatever reply a test sets.
  let reply: { data: unknown; error: { message: string } | null };
  const rpc = vi.fn(async () => reply);

  beforeEach(() => {
    reply = { data: null, error: null };
    rpc.mockClear();
  });
  afterEach(() => {
    vi.doUnmock("server-only");
    vi.doUnmock("@/lib/db/client");
    vi.resetModules();
  });

  async function loadStore() {
    // Pretend we're in server code so the file can load.
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/db/client", () => ({ getServerDb: () => ({ rpc }) }));
    return import("@/lib/labels/store");
  }

  it("fails to load outside server code (like in the browser)", async () => {
    await expect(import("@/lib/labels/store")).rejects.toThrow(
      /cannot be imported from a Client Component/,
    );
  });

  it("returns the label and date, with sections in display order", async () => {
    const sections = labelSections(emgality.record);
    reply = {
      data: {
        drug: "emgality",
        label_id: "label-1",
        set_id: emgality.setId,
        label_date: emgality.labelDate,
        // The database sorts by field name; getCurrentLabel must re-sort.
        sections: [...sections].sort((a, b) => a.field_key.localeCompare(b.field_key)),
      },
      error: null,
    };
    const { getCurrentLabel } = await loadStore();

    const result = await getCurrentLabel("emgality");

    expect(rpc).toHaveBeenCalledWith("get_current_label", { p_drug: "emgality" });
    expect(result).toEqual({
      found: true,
      label: {
        drug: "emgality",
        labelId: "label-1",
        setId: emgality.setId,
        labelDate: emgality.labelDate,
        sections,
      },
    });
    // labelSections() already returns SECTION_NAMES order; double-check it here.
    const order = Object.keys(SECTION_NAMES);
    const keys = sections.map((s) => s.field_key);
    expect(keys).toEqual([...keys].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
  });

  it('returns a clear "not found" result when there is no current label', async () => {
    reply = { data: null, error: null };
    const { getCurrentLabel } = await loadStore();

    await expect(getCurrentLabel("reyvow")).resolves.toEqual({ found: false, drug: "reyvow" });
  });

  it("refuses another drug's label", async () => {
    reply = {
      data: {
        drug: "emgality",
        label_id: "label-1",
        set_id: emgality.setId,
        label_date: emgality.labelDate,
        sections: [],
      },
      error: null,
    };
    const { getCurrentLabel } = await loadStore();

    await expect(getCurrentLabel("reyvow")).rejects.toThrow(/Asked for the reyvow label/);
  });

  it("gives a clear error when the database fails", async () => {
    reply = { data: null, error: { message: "connection refused" } };
    const { getCurrentLabel } = await loadStore();

    await expect(getCurrentLabel("emgality")).rejects.toThrow(
      /Couldn't read the current emgality label: connection refused/,
    );
  });

  it("gives a clear error when the reply has the wrong shape", async () => {
    reply = { data: { drug: "emgality" }, error: null };
    const { getCurrentLabel } = await loadStore();

    await expect(getCurrentLabel("emgality")).rejects.toThrow(/unexpected shape/);
  });
});
