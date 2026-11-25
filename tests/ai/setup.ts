// T073: the AI-tier runner and test-run recorder (research R15, R16; FR-045).
//
// Run by .github/workflows/ai-tests.yml (and locally with `npm run test:ai:run`):
//   1. Commit-ID check: the checked-out commit must be the commit ID it is about to
//      record (RUN_COMMIT_SHA). If not, it stops before writing anything.
//   2. Adds a `running` test_runs row: commit, branch, answer model, grader model
//      (from src/config/models.ts), start time.
//   3. Counts the signed-off entries (answer key + grader calibration set). A loader
//      refuses any unsigned entry, so one unsigned entry fails the run.
//   4. Runs every AI-tier test (vitest project "ai") and counts tests passed/failed.
//   5. Finishes the row with the counts and the status from src/lib/ci/run-status.ts.
//
// Database: it connects with AI_TESTS_DATABASE_URL, the limited `ai_tests_writer`
// login (supabase/migrations/0004_ai_tests_writer.sql). That login can only add
// `running` rows and finish them with public.finish_test_run(). It never uses the
// database's admin key.
//
// This file runs with plain Node, so its own imports are relative and end in `.ts`.
// Files that use the "@/" shortcut (the loaders, the tests) are loaded through
// Vitest, which understands it.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { ANSWER_MODEL, GRADER_MODEL } from "../../src/config/models.ts";
import { runStatus, type RunCounts, type RunStatus } from "../../src/lib/ci/run-status.ts";

/** The starting fields of a test_runs row. */
export interface StartedRun {
  id: string;
  commitSha: string;
  branch: string;
  answerModel: string;
  graderModel: string;
}

/** Where runs are recorded. The real one is the database; tests use a fake. */
export interface RunStore {
  start(run: StartedRun): Promise<void>;
  finish(id: string, counts: RunCounts, status: RunStatus): Promise<void>;
}

export interface TestCounts {
  passed: number;
  failed: number;
}

export interface RecorderInput {
  /** The commit ID to record. */
  commitSha: string;
  branch: string;
  /** The commit that is actually checked out. */
  headCommit: () => string;
  /** Loads the answer key and calibration set and counts signed-off entries. */
  countSignedEntries: () => Promise<number>;
  /** Runs every AI-tier test. */
  runTests: () => Promise<TestCounts>;
  store: RunStore;
  newId?: () => string;
  log?: (message: string) => void;
}

export interface RecordedRun {
  id: string;
  counts: RunCounts;
  status: RunStatus;
}

export async function recordAiTestRun(input: RecorderInput): Promise<RecordedRun> {
  const log = input.log ?? console.log;

  // 1. Commit-ID check, before anything is written.
  const head = input.headCommit().trim();
  if (!input.commitSha || head !== input.commitSha) {
    throw new Error(
      `Commit-ID check failed: the checked-out commit is ${head || "unknown"}, but the run would ` +
        `record ${input.commitSha || "nothing"}. Nothing was recorded.`,
    );
  }

  // 2. The `running` row.
  const id = (input.newId ?? randomUUID)();
  await input.store.start({
    id,
    commitSha: input.commitSha,
    branch: input.branch,
    answerModel: ANSWER_MODEL.id,
    graderModel: GRADER_MODEL.id,
  });
  log(`Recorded test run ${id} as running (commit ${input.commitSha}).`);

  // 3. Signed-off entries. A refused entry means nothing counts and no tests run
  //    (no AI calls are spent on a run that can't pass).
  let signedEntries = 0;
  let tests: TestCounts = { passed: 0, failed: 0 };
  try {
    signedEntries = await input.countSignedEntries();
    log(`Signed-off entries found: ${signedEntries}.`);
    // 4. The AI-tier tests.
    tests = await input.runTests();
  } catch (error) {
    log(`The run stopped early: ${error instanceof Error ? error.message : String(error)}`);
    signedEntries = 0;
  }

  // 5. Finish the row.
  const counts: RunCounts = {
    signedEntries,
    passed: tests.passed,
    failed: tests.failed,
    total: tests.passed + tests.failed,
  };
  const status = runStatus(counts);
  await input.store.finish(id, counts, status);
  log(
    `Test run ${id} finished: ${status} (${counts.passed} passed, ${counts.failed} failed, ` +
      `${counts.total} total).`,
  );
  return { id, counts, status };
}

/** The real store: the online (or local) database, through the writer login. */
export function databaseRunStore(client: pg.Client): RunStore {
  return {
    async start(run) {
      await client.query(
        `insert into public.test_runs
           (id, commit_sha, branch, answer_model, grader_model, started_at, status)
         values ($1, $2, $3, $4, $5, now(), 'running')`,
        [run.id, run.commitSha, run.branch, run.answerModel, run.graderModel],
      );
    },
    async finish(id, counts, status) {
      await client.query("select public.finish_test_run($1, $2, $3, $4, $5)", [
        id,
        counts.passed,
        counts.failed,
        counts.total,
        status,
      ]);
    },
  };
}

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

/** Starts Vitest's "ai" project. Loaded only here, so fast tests never start it. */
async function startAiVitest() {
  const { createVitest } = await import("vitest/node");
  return createVitest("test", { project: ["ai"], watch: false });
}

async function main(): Promise<void> {
  const databaseUrl = process.env.AI_TESTS_DATABASE_URL;
  if (!databaseUrl) throw new Error("AI_TESTS_DATABASE_URL is not set");

  // On GitHub the workflow always sets these. Locally they default to the
  // current commit and branch.
  const inCi = Boolean(process.env.CI);
  const commitSha = process.env.RUN_COMMIT_SHA ?? (inCi ? "" : git("rev-parse", "HEAD"));
  const branch = process.env.RUN_BRANCH ?? (inCi ? "" : git("rev-parse", "--abbrev-ref", "HEAD"));
  if (!commitSha) throw new Error("RUN_COMMIT_SHA is not set");
  if (!branch) throw new Error("RUN_BRANCH is not set");

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const vitest = await startAiVitest();
  try {
    const result = await recordAiTestRun({
      commitSha,
      branch,
      headCommit: () => git("rev-parse", "HEAD"),
      store: databaseRunStore(client),
      async countSignedEntries() {
        const questions = await vitest.import<typeof import("./questions/load.ts")>(
          fileURLToPath(new URL("./questions/load.ts", import.meta.url)),
        );
        const calibration = await vitest.import<typeof import("./grader/load.ts")>(
          fileURLToPath(new URL("./grader/load.ts", import.meta.url)),
        );
        return questions.loadAnswerKey().length + calibration.loadCalibrationSet().length;
      },
      async runTests() {
        const run = await vitest.start();
        let passed = 0;
        let failed = 0;
        for (const testModule of run.testModules) {
          const tests = [...testModule.children.allTests()];
          // A test file that couldn't load has no tests; count it as 1 failure.
          if (tests.length === 0 && testModule.state() === "failed") failed += 1;
          for (const test of tests) {
            if (test.result().state === "passed") passed += 1;
            else failed += 1; // failed, skipped, or never finished
          }
        }
        failed += run.unhandledErrors.length;
        return { passed, failed };
      },
    });
    process.exitCode = result.status === "passed" ? 0 : 1;
  } finally {
    await vitest.close();
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
