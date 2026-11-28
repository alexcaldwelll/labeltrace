// T073: the pass rule for one AI test run (research R15, FR-045, data-model.md
// "test_runs").
//
// A run is `passed` only if at least one checked (signed-off) answer-key entry was
// found, at least one test ran, and every test that ran passed. Anything else is
// `failed`.
//
// T059: if every test passed but the grader couldn't grade at least one test answer,
// the run is `incomplete`, never `passed` (constitution Release Safeguards). `failed`
// takes priority: if the run would fail anyway (a test failed, or no signed-off
// entries), it stays `failed` even when the grader was also down (owner's decision,
// 2026-11-27). A failed grade doesn't change the status (FR-037).
//
// Counts are per test, not per entry: the grader calibration test grades 10
// entries but counts as 1 test, so its own "4 of 5 good answers" rule stays intact
// (owner's decision, 2026-11-24).
//
// Plain TypeScript with no imports, so tests/ai/setup.ts can load it with plain
// Node.

export type RunStatus = "passed" | "failed" | "incomplete";

export interface RunCounts {
  /** How many signed-off entries the answer-key and calibration loaders found. */
  signedEntries: number;
  /** Tests that passed. */
  passed: number;
  /** Tests that failed, errored, or were skipped (anything that didn't pass). */
  failed: number;
  /** All tests: passed + failed. */
  total: number;
}

function isCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/** `graderDown`: the grader couldn't grade at least one test answer (T059). */
export function runStatus(counts: RunCounts, graderDown = false): RunStatus {
  const { signedEntries, passed, failed, total } = counts;
  if (![signedEntries, passed, failed, total].every(isCount)) return "failed";
  if (passed + failed !== total) return "failed";
  if (signedEntries < 1 || total < 1 || failed !== 0) return "failed";
  // Every test passed: incomplete only if the grader couldn't grade an answer.
  return graderDown ? "incomplete" : "passed";
}
