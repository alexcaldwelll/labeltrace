// T015: the ai-gate decision, part 1 (FR-045, research R16).
//
// Pure code (inputs in, decision out) so it can be tested without GitHub or a
// database. scripts/ai-gate.ts gathers the inputs and calls it.
//
// 1. The AI-related list (.github/ai-related-paths.txt). One pattern per line.
//    Lines starting with "#" and blank lines are skipped. A line ending in "/**"
//    means everything inside that folder. A line with no "*" matches that exact
//    file. Any other use of "*" is refused, so a pattern can never quietly match
//    nothing.
// 2. A changed file is AI-related if EITHER copy of the list names it: the PR's
//    base (main) or the PR's latest commit. So a PR can't remove its own files
//    from the list (owner's decision D1, 2026-11-25).
// 3. If any changed file is AI-related, the PR's latest commit needs a test_runs
//    row with status "passed" whose answer_model and grader_model both match
//    src/config/models.ts at that commit.
//
// Plain TypeScript with no imports, so scripts/ai-gate.ts can load it with plain
// Node.

export const MESSAGES = {
  noRun: "Run the ai-tests workflow on this commit",
  incomplete: "The AI test run is incomplete. Run the ai-tests workflow again",
  failed: "The AI test run failed. Fix the failures and run the ai-tests workflow again",
  modelMismatch:
    "The AI test run used a different model than src/config/models.ts. Run the ai-tests workflow with the configured models",
} as const;

export type Pattern = { kind: "folder"; prefix: string } | { kind: "file"; path: string };

/** Reads the AI-related list. Throws on a pattern shape it doesn't support. */
export function parsePatterns(text: string): Pattern[] {
  const patterns: Pattern[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    if (line.endsWith("/**") && !line.slice(0, -3).includes("*")) {
      patterns.push({ kind: "folder", prefix: line.slice(0, -2) });
    } else if (!line.includes("*")) {
      patterns.push({ kind: "file", path: line });
    } else {
      throw new Error(`Unsupported pattern in .github/ai-related-paths.txt: ${line}`);
    }
  }
  return patterns;
}

export function matches(path: string, pattern: Pattern): boolean {
  return pattern.kind === "folder" ? path.startsWith(pattern.prefix) : path === pattern.path;
}

/** The changed files that either copy of the list names. */
export function aiRelatedFiles(changedFiles: string[], ...lists: Pattern[][]): string[] {
  const patterns = lists.flat();
  return changedFiles.filter((file) => patterns.some((pattern) => matches(file, pattern)));
}

export interface TestRun {
  status: string;
  answer_model: string;
  grader_model: string;
}

export interface Models {
  answer: string;
  grader: string;
}

export type GateResult = { pass: true; message: string } | { pass: false; message: string };

export function decideGate(input: {
  aiFiles: string[];
  runs: TestRun[];
  models: Models;
}): GateResult {
  const { aiFiles, runs, models } = input;
  if (aiFiles.length === 0) {
    return { pass: true, message: "No AI-related files changed. No AI test run needed." };
  }
  const passed = runs.filter((run) => run.status === "passed");
  const matching = passed.find(
    (run) => run.answer_model === models.answer && run.grader_model === models.grader,
  );
  if (matching) {
    return { pass: true, message: "A passing AI test run with the configured models exists." };
  }
  if (passed.length > 0) return { pass: false, message: MESSAGES.modelMismatch };
  if (runs.some((run) => run.status === "incomplete")) {
    return { pass: false, message: MESSAGES.incomplete };
  }
  if (runs.some((run) => run.status === "failed")) {
    return { pass: false, message: MESSAGES.failed };
  }
  return { pass: false, message: MESSAGES.noRun };
}
