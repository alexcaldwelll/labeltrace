// quickstart.md section 9, step 7: check the ONLINE ai_tests_writer login can do only
// what it should. Run it in your own Terminal, from the labeltrace folder (the
// certificate path below is relative to it):
//   cd ~/Desktop/labeltrace
//   node scripts/writer-login-check.mjs
//
// It asks ONLY for the writer password (typing hidden; wait for the prompt before
// pasting), and builds the connection string itself from the same template as the
// AI_TESTS_DATABASE_URL secret. Then:
//   1. adds one practice test_runs row with status 'running'   -> should WORK
//   2. finishes it with finish_test_run(id, 1, 0, 1, 'passed')  -> should WORK
//   3. runs the same finish_test_run call again                 -> should be REFUSED
//   4. adds a row with status 'passed'                          -> should be REFUSED
//   5. changes the practice row directly                        -> should be REFUSED
//   6. deletes the practice row directly                        -> should be REFUSED
//   7. reads test_runs                                          -> should be REFUSED
//   8. reads log_entries                                        -> should be REFUSED
// The practice row's commit is 40 zeros (never a real commit) and its branch is
// practice-writer-check, so ai-gate can never match it, even if it isn't deleted.
// It never prints the password or the full connection string.
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { TLSSocket } from "node:tls";
import { pathToFileURL } from "node:url";

/** The online target: the same parts as the AI_TESTS_DATABASE_URL secret. */
export const ONLINE = {
  user: "ai_tests_writer.zduoraqwelcbpzwtzvol",
  host: "aws-0-us-east-1.pooler.supabase.com",
  port: 5432,
  database: "postgres",
  query: "sslmode=verify-full&sslrootcert=supabase/certs/supabase-root-2021.crt",
};

export const PRACTICE_COMMIT = "0".repeat(40);
export const PRACTICE_BRANCH = "practice-writer-check";

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

/** Runs the 8 checks on a connected client. Returns true if all are as expected. */
export async function runChecks(db, log = console.log) {
  const id = randomUUID();
  let allGood = true;

  async function expectWorks(label, sql, params) {
    try {
      await db.query(sql, params);
      log(`OK       ${label}: worked`);
    } catch (error) {
      allGood = false;
      log(`PROBLEM  ${label}: was refused (${error.code}) but should work`);
    }
  }
  async function expectRefused(label, sql, params) {
    try {
      await db.query(sql, params);
      allGood = false;
      log(`PROBLEM  ${label}: WORKED but should be refused`);
    } catch (error) {
      log(`OK       ${label}: refused (${error.code})`);
    }
  }

  log(
    `Practice row: commit ${PRACTICE_COMMIT} (40 zeros, never a real commit), ` +
      `branch ${PRACTICE_BRANCH}, so ai-gate can never match it.`,
  );
  await expectWorks(
    "1. add a 'running' row",
    `insert into public.test_runs
       (id, commit_sha, branch, answer_model, grader_model, started_at, status)
     values ($1, $2, $3, 'practice', 'practice', now(), 'running')`,
    [id, PRACTICE_COMMIT, PRACTICE_BRANCH],
  );
  await expectWorks("2. finish it", "select public.finish_test_run($1, 1, 0, 1, 'passed')", [id]);
  await expectRefused(
    "3. finish it again",
    "select public.finish_test_run($1, 1, 0, 1, 'passed')",
    [id],
  );
  await expectRefused(
    "4. add a 'passed' row",
    `insert into public.test_runs (id, commit_sha, branch, answer_model, grader_model, status)
     values ($1, $2, $3, 'practice', 'practice', 'passed')`,
    [randomUUID(), PRACTICE_COMMIT, PRACTICE_BRANCH],
  );
  await expectRefused(
    "5. change a row",
    "update public.test_runs set status = 'failed' where id = $1",
    [id],
  );
  await expectRefused("6. delete a row", "delete from public.test_runs where id = $1", [id]);
  await expectRefused("7. read test_runs", "select * from public.test_runs limit 1");
  await expectRefused("8. read log_entries", "select * from public.log_entries limit 1");

  log(
    allGood
      ? "\nAll 8 checks are as expected."
      : "\nSome checks were NOT as expected (see PROBLEM lines).",
  );
  log(`\nPractice row id (delete it with your admin login): ${id}`);
  return allGood;
}

async function main() {
  const certPath = "supabase/certs/supabase-root-2021.crt";
  if (!existsSync(certPath)) {
    throw new Error(`Can't find ${certPath}. Run this from the labeltrace folder.`);
  }
  const pg = createRequire(`${process.cwd()}/package.json`)("pg");

  const password = await askHidden("ai_tests_writer password (hidden): ");
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
