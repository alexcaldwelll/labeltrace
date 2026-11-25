// T015: the ai-gate check, part 1 (FR-045, research R16). Run by
// .github/workflows/ai-gate.yml on every pull request.
//
//   1. Lists the changed files: git diff --name-only --no-renames <base>...<head>.
//      --no-renames lists a moved file under both its old and new paths, so moving a
//      file out of an AI folder still counts.
//   2. Reads .github/ai-related-paths.txt from BOTH the base (main) and the PR's
//      latest commit; a file counts if either copy names it (owner's decision D1).
//   3. If no changed file is AI-related, it passes without touching the database.
//   4. Otherwise it reads the models from src/config/models.ts at the PR's latest
//      commit (the checked-out code), reads that commit's test_runs rows with the
//      read-only AI_GATE_DATABASE_URL login, and lets src/lib/ci/gate.ts decide.
//
// Settings (environment variables): BASE_SHA, HEAD_SHA, AI_GATE_DATABASE_URL.
//
// `--changes-only` (T090, used by ai-tests.yml's first job): does steps 1-2 only,
// with the same code, and writes `ai=true` or `ai=false` to GitHub's step output
// (GITHUB_OUTPUT). It never reads the database, so it needs no secrets, and it loads
// no installed packages, so it needs no `npm ci`. It always exits 0 when it could
// work out the answer; ai-gate itself still decides whether a PR may merge.
// Leftover risks (research R16, closed by T089): this runs the PR's own copy of
// this file and of ai-gate.yml.
//
// Runs with plain Node, so imports are relative and end in `.ts`.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { ANSWER_MODEL, GRADER_MODEL } from "../src/config/models.ts";
import { aiRelatedFiles, decideGate, parsePatterns, type TestRun } from "../src/lib/ci/gate.ts";

const LIST_PATH = ".github/ai-related-paths.txt";
const SHA = /^[0-9a-f]{40}$/;

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** The list at a commit, or "" if that commit has no list. */
function listAt(sha: string): string {
  try {
    return git("show", `${sha}:${LIST_PATH}`);
  } catch {
    return "";
  }
}

async function readRuns(databaseUrl: string, sha: string): Promise<TestRun[]> {
  // Loaded only here, so --changes-only works without `npm ci`.
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 15000 });
  await client.connect();
  try {
    const { rows } = await client.query<TestRun>(
      "select status, answer_model, grader_model from public.test_runs where commit_sha = $1",
      [sha],
    );
    return rows;
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const base = process.env.BASE_SHA ?? "";
  const head = process.env.HEAD_SHA ?? "";
  if (!SHA.test(base) || !SHA.test(head)) {
    throw new Error("BASE_SHA and HEAD_SHA must be full commit IDs");
  }
  const checkedOut = git("rev-parse", "HEAD").trim();
  if (checkedOut !== head) {
    throw new Error(`The checked-out commit ${checkedOut} isn't the PR's latest commit ${head}`);
  }

  const changed = git("diff", "--name-only", "--no-renames", `${base}...${head}`)
    .split("\n")
    .filter((line) => line !== "");
  const aiFiles = aiRelatedFiles(changed, parsePatterns(listAt(base)), parsePatterns(listAt(head)));
  console.log(`Changed files: ${changed.length}. AI-related: ${aiFiles.length}.`);
  for (const file of aiFiles) console.log(`  ${file}`);

  if (process.argv.includes("--changes-only")) {
    const line = `ai=${aiFiles.length > 0}`;
    console.log(line);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`);
    return;
  }

  let runs: TestRun[] = [];
  if (aiFiles.length > 0) {
    const databaseUrl = process.env.AI_GATE_DATABASE_URL;
    if (!databaseUrl) throw new Error("AI_GATE_DATABASE_URL is not set");
    runs = await readRuns(databaseUrl, head);
    console.log(`AI test runs recorded for ${head}: ${runs.length}.`);
  }

  const result = decideGate({
    aiFiles,
    runs,
    models: { answer: ANSWER_MODEL.id, grader: GRADER_MODEL.id },
  });
  console.log(result.message);
  process.exitCode = result.pass ? 0 : 1;
}

main().catch((error: unknown) => {
  // pg's error messages never include the password.
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
