// T074: the release check (research R21). Run by .github/workflows/release.yml when a
// `v*` tag is pushed.
//
//   1. The tag must have been pushed by the owner (OWNER in src/lib/ci/gate.ts).
//   2. The tagged commit must be on main.
//   3. The tagged commit needs a passed test_runs row made with the models in
//      src/config/models.ts at that commit (the same run check as ai-gate). It reads
//      results with the read-only AI_GATE_DATABASE_URL login.
//
// Publishing to Netlify is T074b (release milestone); for now a passing check
// publishes nothing.
//
// Settings (environment variables): TAG_SHA, PUSHER, AI_GATE_DATABASE_URL.
// Runs with plain Node, so imports are relative and end in `.ts`.
import { execFileSync } from "node:child_process";
import { ANSWER_MODEL, GRADER_MODEL } from "../src/config/models.ts";
import { OWNER, decideRelease, type TestRun } from "../src/lib/ci/gate.ts";

const SHA = /^[0-9a-f]{40}$/;

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" });
}

function isOnMain(sha: string): boolean {
  try {
    git("merge-base", "--is-ancestor", sha, "origin/main");
    return true;
  } catch {
    return false;
  }
}

async function readRuns(databaseUrl: string, sha: string): Promise<TestRun[]> {
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
  const tag = process.env.TAG_SHA ?? "";
  const pusher = process.env.PUSHER ?? "";
  if (!SHA.test(tag)) throw new Error("TAG_SHA must be a full commit ID");
  const checkedOut = git("rev-parse", "HEAD").trim();
  if (checkedOut !== tag) {
    throw new Error(`The checked-out commit ${checkedOut} isn't the tagged commit ${tag}`);
  }

  const onMain = isOnMain(tag);
  console.log(`Tagged commit: ${tag}. Pushed by: ${pusher || "unknown"}. On main: ${onMain}.`);

  // Only read the database once the owner and main checks could pass.
  let runs: TestRun[] = [];
  if (pusher === OWNER && onMain) {
    const databaseUrl = process.env.AI_GATE_DATABASE_URL;
    if (!databaseUrl) throw new Error("AI_GATE_DATABASE_URL is not set");
    runs = await readRuns(databaseUrl, tag);
    console.log(`AI test runs recorded for ${tag}: ${runs.length}.`);
  }

  const result = decideRelease({
    pusher,
    onMain,
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
