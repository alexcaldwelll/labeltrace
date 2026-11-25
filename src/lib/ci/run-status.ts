// T073: the pass rule for one AI test run (research R15, FR-045, data-model.md
// "test_runs").
//
// A run is `passed` only if at least one checked (signed-off) answer-key entry was
// found, at least one test ran, and every test that ran passed. Anything else is
// `failed`. (`incomplete`, for when the grader is down, is added in T059.)
//
// Counts are per test, not per entry: the grader calibration test grades 10
// entries but counts as 1 test, so its own "4 of 5 good answers" rule stays intact
// (owner's decision, 2026-11-24).
//
// Plain TypeScript with no imports, so tests/ai/setup.ts can load it with plain
// Node.

export type RunStatus = "passed" | "failed";

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

export function runStatus(counts: RunCounts): RunStatus {
  const { signedEntries, passed, failed, total } = counts;
  if (![signedEntries, passed, failed, total].every(isCount)) return "failed";
  if (passed + failed !== total) return "failed";
  if (signedEntries < 1 || total < 1 || failed !== 0) return "failed";
  return "passed";
}
