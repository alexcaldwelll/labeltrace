// scripts/scram-verifier.mjs: the scrambled password (SCRAM verifier) it makes really
// works in Postgres, so a future edit can't silently break it (T071 steps 2 and 4).
//
// Needs the local Supabase database (`npx supabase start`). fast-tests starts it
// on GitHub. These tests never skip: if the database isn't running, they fail.
//
// A throwaway test role is created with a random password made while the test runs
// (never printed). It gets login and nothing else. It has to be saved for real (not
// inside a rolled-back transaction), because a separate login can't see a role that
// isn't saved yet, so it is always deleted afterward. The database log records only
// the scrambled version, never the password.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Local Supabase's fixed, public default address. Not a secret: it only works on
// this computer or the GitHub runner, and the online database never uses it.
const LOCAL_DB_URL =
  process.env.LOCAL_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// The script is plain JavaScript and TypeScript isn't set up to read JavaScript
// files, so it is loaded by a path held in a variable (TypeScript doesn't follow it).
const SCRIPT_PATH = "../../../scripts/scram-verifier.mjs";
type ScramModule = {
  scramVerifier: (password: string) => string;
  checkRole: (role: string | undefined) => string;
  alterRoleLine: (role: string, verifier: string) => string;
};
const SCRIPT_FILE = fileURLToPath(new URL(SCRIPT_PATH, import.meta.url));

const admin = new pg.Client({ connectionString: LOCAL_DB_URL });
const role = `scram_check_${randomBytes(6).toString("hex")}`;
const password = randomBytes(24).toString("hex"); // 48 letters and numbers
let scramVerifier: ScramModule["scramVerifier"];
let checkRole: ScramModule["checkRole"];
let alterRoleLine: ScramModule["alterRoleLine"];
let verifier: string;

function loginUrl(pw: string): string {
  const url = new URL(LOCAL_DB_URL);
  url.username = role;
  url.password = pw;
  return url.toString();
}

async function tryLogin(pw: string): Promise<string> {
  const client = new pg.Client({ connectionString: loginUrl(pw) });
  try {
    await client.connect();
    await client.end();
    return "logged in";
  } catch (error) {
    return (error as { code?: string }).code ?? "error";
  }
}

beforeAll(async () => {
  ({ scramVerifier, checkRole, alterRoleLine } = (await import(
    /* @vite-ignore */ SCRIPT_PATH
  )) as ScramModule);
  verifier = scramVerifier(password);
  await admin.connect();
  // Role names can't be query parameters; this one is made here from hex only.
  await admin.query(`create role ${role} with login password ${admin.escapeLiteral(verifier)}`);
});

afterAll(async () => {
  try {
    await admin.query(`drop role if exists ${role}`);
  } finally {
    await admin.end();
  }
});

describe("scripts/scram-verifier.mjs", () => {
  it("makes a verifier in the shape Postgres expects", () => {
    expect(verifier).toMatch(
      /^SCRAM-SHA-256\$4096:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/,
    );
  });

  it("gives a different verifier each time for the same password (random salt)", () => {
    expect(scramVerifier(password)).not.toBe(scramVerifier(password));
  });

  it("is stored by Postgres exactly as given (not scrambled again)", async () => {
    const { rows } = await admin.query(
      "select rolpassword = $1 as same from pg_authid where rolname = $2",
      [verifier, role],
    );
    expect(rows[0].same).toBe(true);
  });

  it("lets the right password log in", async () => {
    expect(await tryLogin(password)).toBe("logged in");
  });

  it("refuses a wrong password", async () => {
    const wrong = `${password.slice(0, -1)}${password.endsWith("a") ? "b" : "a"}`;
    expect(await tryLogin(wrong)).toBe("28P01"); // invalid_password
  });
});

describe("scripts/scram-verifier.mjs: which role the line is for", () => {
  for (const role of ["ai_tests_writer", "ai_gate_reader"]) {
    it(`prints the right alter role line for ${role}`, () => {
      expect(alterRoleLine(role, verifier)).toBe(
        `alter role ${role} with login password '${verifier}';`,
      );
    });
  }

  for (const role of ["postgres", "authenticated", "", "ai_gate_reader; drop table x"]) {
    it(`refuses the role "${role}"`, () => {
      expect(() => checkRole(role)).toThrow(/Unknown role.*Nothing was made/);
      expect(() => alterRoleLine(role, verifier)).toThrow(/Unknown role/);
    });
  }

  // Running the script itself, with no terminal attached (so it can never get a password).
  function runScript(...args: string[]) {
    return spawnSync(process.execPath, [SCRIPT_FILE, ...args], { encoding: "utf8", input: "" });
  }

  it("running it with an unknown role stops before asking for a password", () => {
    const result = runScript("postgres");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Unknown role "postgres"/);
    expect(result.stdout).not.toMatch(/password \(hidden\)/);
  });

  it("running it with an allowed role names the role before asking for a password", () => {
    const result = runScript("ai_gate_reader");
    expect(result.stdout).toMatch(/^Making a scrambled password for: ai_gate_reader$/m);
    // No terminal is attached, so it stops there instead of asking.
    expect(result.stderr).toMatch(/Run this in your own Terminal window/);
    expect(result.status).toBe(1);
  });
});
