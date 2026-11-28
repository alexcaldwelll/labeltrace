// quickstart.md section 9, step 6: check the ONLINE ai_gate_reader login can only
// read test_runs and the grader flags (T086). Run it in your own Terminal, from the labeltrace folder (the
// certificate path below is relative to it):
//   cd ~/Desktop/labeltrace
//   node scripts/gate-login-check.mjs
//
// It asks ONLY for the gate password (typing hidden; wait for the prompt before
// pasting), and builds the connection string itself from the same template as the
// AI_GATE_DATABASE_URL secret. Then:
//   1. reads test_runs (prints only how many rows it sees)     -> should WORK
//   2. the row rule for this role is in place (pg_policies)    -> should be FOUND
//   3. adds a test_runs row                                    -> should be REFUSED
//   4. reads log_entries                                       -> should be REFUSED
//   5. reads grader_results (the columns ai-gate needs, T086)  -> should WORK
//   6. reads owner_flag_decisions (the same, T086)             -> should WORK
//   7. reads the hidden columns (grader_reason, scrubbed_question, answer, and the
//      decision reason)                                        -> each should be REFUSED
// Check 2 is there because a read with 0 rows would look the same with or without
// the row rule (without it, Row Level Security hides every row, with no error).
// If check 3 were ever wrongly allowed, its row uses commit 40 zeros and branch
// practice-gate-check, so ai-gate could never match it; nothing else is written.
// It never prints the password or the full connection string.
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { TLSSocket } from "node:tls";
import { pathToFileURL } from "node:url";

/** The online target: the same parts as the AI_GATE_DATABASE_URL secret. */
export const ONLINE = {
  user: "ai_gate_reader.zduoraqwelcbpzwtzvol",
  host: "aws-0-us-east-1.pooler.supabase.com",
  port: 5432,
  database: "postgres",
  query: "sslmode=verify-full&sslrootcert=supabase/certs/supabase-root-2021.crt",
};

export const PRACTICE_COMMIT = "0".repeat(40);
export const PRACTICE_BRANCH = "practice-gate-check";

export function buildUrl(password, target = ONLINE) {
  const query = target.query ? `?${target.query}` : "";
  return (
    `postgresql://${target.user}:${encodeURIComponent(password)}` +
    `@${target.host}:${target.port}/${target.database}${query}`
  );
}

/** Reads one line from the terminal without showing what is typed. */
export function askHidden(prompt) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY) {
      reject(new Error("Run this in your own Terminal window, so the typing can be hidden."));
      return;
    }
    process.stdout.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    let value = "";
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          input.setRawMode(false);
          input.pause();
          input.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          input.setRawMode(false);
          process.stdout.write("\nStopped.\n");
          process.exit(1);
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    input.on("data", onData);
  });
}

/** Runs the 7 checks on a connected client. Returns true if all are as expected. */
export async function runChecks(db, log = console.log) {
  let allGood = true;

  try {
    const { rows } = await db.query("select count(*)::int as n from public.test_runs");
    log(`OK       1. read test_runs: worked (sees ${rows[0].n} row(s))`);
  } catch (error) {
    allGood = false;
    log(`PROBLEM  1. read test_runs: was refused (${error.code}) but should work`);
  }

  try {
    const { rows } = await db.query(
      `select count(*)::int as n from pg_policies
        where schemaname = 'public' and tablename = 'test_runs'
          and policyname = 'test_runs_gate_reader_reads_all'
          and cmd = 'SELECT' and roles = '{ai_gate_reader}'`,
    );
    if (rows[0].n === 1) {
      log("OK       2. row rule for ai_gate_reader on test_runs: found");
    } else {
      allGood = false;
      log("PROBLEM  2. row rule for ai_gate_reader on test_runs: NOT found");
    }
  } catch (error) {
    allGood = false;
    log(`PROBLEM  2. row rule check couldn't run (${error.code})`);
  }

  try {
    await db.query(
      `insert into public.test_runs (id, commit_sha, branch, answer_model, grader_model, status)
       values ($1, $2, $3, 'practice', 'practice', 'running')`,
      [randomUUID(), PRACTICE_COMMIT, PRACTICE_BRANCH],
    );
    allGood = false;
    log(
      `PROBLEM  3. add a test_runs row: WORKED but should be refused ` +
        `(practice row: commit ${PRACTICE_COMMIT}, branch ${PRACTICE_BRANCH})`,
    );
  } catch (error) {
    log(`OK       3. add a test_runs row: refused (${error.code})`);
  }

  try {
    await db.query("select * from public.log_entries limit 1");
    allGood = false;
    log("PROBLEM  4. read log_entries: WORKED but should be refused");
  } catch (error) {
    log(`OK       4. read log_entries: refused (${error.code})`);
  }

  // Checks 5 and 6 (T086, migration 0008): only the columns ai-gate needs.
  try {
    const { rows } = await db.query(
      "select count(id)::int as n from public.grader_results where needs_owner_decision",
    );
    log(`OK       5. read grader_results: worked (sees ${rows[0].n} flag(s))`);
  } catch (error) {
    allGood = false;
    log(`PROBLEM  5. read grader_results: was refused (${error.code}) but should work`);
  }

  try {
    const { rows } = await db.query(
      "select count(grader_result_id)::int as n from public.owner_flag_decisions",
    );
    log(`OK       6. read owner_flag_decisions: worked (sees ${rows[0].n} decision(s))`);
  } catch (error) {
    allGood = false;
    log(`PROBLEM  6. read owner_flag_decisions: was refused (${error.code}) but should work`);
  }

  // Check 7 (owner-approved 2026-11-27): the columns ai-gate doesn't need stay hidden.
  const hidden = [
    ["grader_results", "grader_reason"],
    ["grader_results", "scrubbed_question"],
    ["grader_results", "answer"],
    ["owner_flag_decisions", "reason"],
  ];
  const readable = [];
  for (const [table, column] of hidden) {
    try {
      await db.query(`select ${column} from public.${table} limit 1`);
      readable.push(`${table}.${column}`);
    } catch {
      // Refused, as it should be.
    }
  }
  if (readable.length === 0) {
    log("OK       7. read the hidden grader columns: each refused");
  } else {
    allGood = false;
    log(`PROBLEM  7. read the hidden grader columns: WORKED for ${readable.join(", ")}`);
  }

  log(
    allGood
      ? "\nAll 7 checks are as expected."
      : "\nSome checks were NOT as expected (see PROBLEM lines).",
  );
  return allGood;
}

async function main() {
  const certPath = "supabase/certs/supabase-root-2021.crt";
  if (!existsSync(certPath)) {
    throw new Error(`Can't find ${certPath}. Run this from the labeltrace folder.`);
  }
  const pg = createRequire(`${process.cwd()}/package.json`)("pg");

  const password = await askHidden("ai_gate_reader password (hidden): ");
  if (!/^[A-Za-z0-9]{40,}$/.test(password)) {
    throw new Error("That isn't 40+ letters and numbers. Nothing was sent.");
  }

  console.log(
    `Connecting as ${ONLINE.user} to ${ONLINE.host}:${ONLINE.port} ` +
      "(sslmode=verify-full, Supabase root certificate)...",
  );
  const db = new pg.Client({
    connectionString: buildUrl(password),
    connectionTimeoutMillis: 15000,
  });
  try {
    await db.connect();
  } catch (error) {
    // pg's error messages never include the password.
    throw new Error(`Could not connect: ${error.code ?? ""} ${error.message}`);
  }
  console.log("Connected. Encrypted:", db.connection.stream instanceof TLSSocket);
  try {
    const ok = await runChecks(db);
    process.exitCode = ok ? 0 : 1;
  } finally {
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
