// T073: the AI-tier runner and test-run recorder (tests/ai/setup.ts) and the pass
// rule (src/lib/ci/run-status.ts). The AI tests and the database are replaced by
// fakes, so no AI calls are made and nothing is written to a real database.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ANSWER_MODEL, GRADER_MODEL } from "@/config/models";
import type { RunCounts, RunStatus } from "@/lib/ci/run-status";
import { loadCalibrationSet } from "../../ai/grader/load";
import {
  recordAiTestRun,
  type RecorderInput,
  type RunStore,
  type StartedRun,
  type TestCounts,
} from "../../ai/setup";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";

// The fake database: remembers every write.
function fakeStore() {
  const writes: (
    | { kind: "start"; run: StartedRun }
    | { kind: "finish"; id: string; counts: RunCounts; status: RunStatus }
  )[] = [];
  const store: RunStore = {
    async start(run) {
      writes.push({ kind: "start", run });
    },
    async addGrade() {
      // Grading has its own tests (tests/fast/grading/test-run-recorder.test.ts).
    },
    async finish(id, counts, status) {
      writes.push({ kind: "finish", id, counts, status });
    },
  };
  return { store, writes };
}

// The fake AI tier: returns the given counts and remembers whether it ran.
function fakeTests(counts: TestCounts) {
  const state = { ran: false };
  return {
    state,
    runTests: async () => {
      state.ran = true;
      return counts;
    },
  };
}

function input(overrides: Partial<RecorderInput>): RecorderInput {
  return {
    commitSha: COMMIT,
    branch: "impl/test",
    headCommit: () => COMMIT,
    countSignedEntries: async () => 1,
    runTests: async () => ({ passed: 1, failed: 0 }),
    store: fakeStore().store,
    newId: () => "run-1",
    log: () => {},
    ...overrides,
  };
}

describe("test-run recorder", () => {
  it("0 signed entries → failed", async () => {
    const { store, writes } = fakeStore();
    const result = await recordAiTestRun(
      input({
        store,
        countSignedEntries: async () => 0,
        runTests: async () => ({ passed: 0, failed: 0 }),
      }),
    );
    expect(result.status).toBe("failed");
    expect(writes.at(-1)).toMatchObject({ kind: "finish", status: "failed" });
  });

  it("all tests pass → passed", async () => {
    const { store, writes } = fakeStore();
    const result = await recordAiTestRun(
      input({
        store,
        countSignedEntries: async () => 3,
        runTests: async () => ({ passed: 3, failed: 0 }),
      }),
    );
    expect(result.status).toBe("passed");
    expect(writes.at(-1)).toEqual({
      kind: "finish",
      id: "run-1",
      counts: { signedEntries: 3, passed: 3, failed: 0, total: 3 },
      status: "passed",
    });
  });

  // Owner-approved (2026-11-27, T059 detail 8).
  it("the grader was down → incomplete, even if every test passed", async () => {
    const { runStatus } = await import("@/lib/ci/run-status");
    const counts = { signedEntries: 3, passed: 3, failed: 0, total: 3 };
    expect(runStatus(counts)).toBe("passed");
    expect(runStatus(counts, true)).toBe("incomplete");
  });

  // Owner's decision (2026-11-27): failed takes priority over incomplete.
  it("a test failed and the grader was down → failed, not incomplete", async () => {
    const { runStatus } = await import("@/lib/ci/run-status");
    const counts = { signedEntries: 3, passed: 2, failed: 1, total: 3 };
    expect(runStatus(counts, true)).toBe("failed");
  });

  it("one test fails → failed", async () => {
    const result = await recordAiTestRun(
      input({
        countSignedEntries: async () => 3,
        runTests: async () => ({ passed: 2, failed: 1 }),
      }),
    );
    expect(result.status).toBe("failed");
    expect(result.counts).toEqual({ signedEntries: 3, passed: 2, failed: 1, total: 3 });
  });

  it("a run with only the signed-off calibration entries, all passing → passed", async () => {
    // The real calibration set (T063), loaded by its real loader.
    const result = await recordAiTestRun(
      input({
        countSignedEntries: async () => loadCalibrationSet().length,
        // Calibration counts as 1 test (owner's decision 2, option A).
        runTests: async () => ({ passed: 1, failed: 0 }),
      }),
    );
    expect(result.counts.signedEntries).toBe(10);
    expect(result.status).toBe("passed");
  });

  it("an unsigned calibration entry is refused by the loader, so it isn't counted → failed", async () => {
    const entries = JSON.parse(
      readFileSync(new URL("../../ai/grader/calibration.json", import.meta.url), "utf8"),
    ) as Record<string, unknown>[];
    const unsigned = entries.map((entry, i) => {
      if (i > 0) return entry;
      const copy = { ...entry };
      delete copy.checked_by;
      return copy;
    });
    const file = join(mkdtempSync(join(tmpdir(), "calibration-")), "calibration.json");
    writeFileSync(file, JSON.stringify(unsigned));

    const tests = fakeTests({ passed: 1, failed: 0 });
    const { store, writes } = fakeStore();
    const result = await recordAiTestRun(
      input({
        store,
        countSignedEntries: async () => loadCalibrationSet(file).length,
        runTests: tests.runTests,
      }),
    );
    expect(result.counts.signedEntries).toBe(0);
    expect(result.status).toBe("failed");
    // No AI tests are run (and no AI money spent) on a run that can't pass.
    expect(tests.state.ran).toBe(false);
    expect(writes.at(-1)).toMatchObject({ kind: "finish", status: "failed" });
  });

  it("the row records the commit, branch, and both models", async () => {
    const { store, writes } = fakeStore();
    await recordAiTestRun(input({ store }));
    expect(writes[0]).toEqual({
      kind: "start",
      run: {
        id: "run-1",
        commitSha: COMMIT,
        branch: "impl/test",
        answerModel: ANSWER_MODEL.id,
        graderModel: GRADER_MODEL.id,
      },
    });
  });

  it("commit-ID check: a different checked-out commit stops the run with 0 writes", async () => {
    const { store, writes } = fakeStore();
    const tests = fakeTests({ passed: 1, failed: 0 });
    await expect(
      recordAiTestRun(
        input({
          store,
          headCommit: () => "ffffffffffffffffffffffffffffffffffffffff",
          runTests: tests.runTests,
        }),
      ),
    ).rejects.toThrow(/Commit-ID check failed/);
    expect(writes).toHaveLength(0);
    expect(tests.state.ran).toBe(false);
  });
});

describe("ai-tests workflow", () => {
  const workflow = readFileSync(
    new URL("../../../.github/workflows/ai-tests.yml", import.meta.url),
    "utf8",
  );

  it("runs on pull requests and by hand", () => {
    expect(workflow).toMatch(/^on:\n(?:.*\n)*?\s+pull_request:\s*$/m);
    expect(workflow).toMatch(/^\s+workflow_dispatch:\s*$/m);
  });

  it("never uses pull_request_target (comment lines are ignored)", () => {
    // pull_request_target would run PR code with access to secrets. The file's own
    // warning comment mentions the name, so comment lines are left out first.
    const code = workflow
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    expect(code).not.toMatch(/pull_request_target/);
  });

  it("its job uses the ai-tests environment", () => {
    expect(workflow).toMatch(/^\s+environment: ai-tests\s*$/m);
  });

  // T090: the text of one job, from its "  name:" line to the next job (or the end).
  function jobBlock(name: string): string {
    const start = workflow.indexOf(`\n  ${name}:\n`);
    expect(start).toBeGreaterThan(-1);
    const rest = workflow.slice(start + 1);
    const next = rest.slice(1).search(/\n {2}[a-z][a-z-]*:\n/);
    return next === -1 ? rest : rest.slice(0, next + 1);
  }

  it("T090: the first job (ai-related-changes) has no environment and no secrets", () => {
    const first = jobBlock("ai-related-changes");
    expect(first).not.toMatch(/environment:/);
    expect(first).not.toMatch(/secrets\./);
  });

  it("T090: the ai-tests job still uses the ai-tests environment and depends on the first job", () => {
    const job = jobBlock("ai-tests");
    expect(job).toMatch(/^\s+environment: ai-tests\s*$/m);
    expect(job).toMatch(/^\s+needs: ai-related-changes\s*$/m);
    expect(job).toMatch(/^\s+if: needs\.ai-related-changes\.outputs\.ai == 'true'\s*$/m);
  });

  it("T090: hand runs (workflow_dispatch) still run it", () => {
    const first = jobBlock("ai-related-changes");
    // Only pull requests are checked for AI-related files; anything else says ai=true.
    expect(first).toMatch(/if \[ "\$EVENT_NAME" = "pull_request" \]; then/);
    expect(first).toMatch(/else\n(?:.*\n)*?\s+echo "ai=true" >> "\$GITHUB_OUTPUT"/);
  });
});
