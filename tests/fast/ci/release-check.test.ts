// T074: the release check (decideRelease in src/lib/ci/gate.ts) and its workflow
// (.github/workflows/release.yml). No GitHub or database calls: runs are made up.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ANSWER_MODEL, GRADER_MODEL } from "@/config/models";
import { decideRelease, type TestRun } from "@/lib/ci/gate";

const models = { answer: ANSWER_MODEL.id, grader: GRADER_MODEL.id };

function run(status: string, overrides: Partial<TestRun> = {}): TestRun {
  return { status, answer_model: models.answer, grader_model: models.grader, ...overrides };
}

function release(input: { pusher?: string; onMain?: boolean; runs?: TestRun[] }) {
  return decideRelease({
    pusher: input.pusher ?? "alexcaldwelll",
    onMain: input.onMain ?? true,
    runs: input.runs ?? [],
    models,
  });
}

describe("release check", () => {
  it("tag by the bot → fail", () => {
    expect(release({ pusher: "labeltrace-bot", runs: [run("passed")] })).toEqual({
      pass: false,
      message: "Only the owner can release",
    });
  });

  it("X1: tag on a commit not in main → fail", () => {
    expect(release({ onMain: false, runs: [run("passed")] })).toEqual({
      pass: false,
      message: "Releases must be tagged on a commit in main",
    });
  });

  it("no run → fail with the release message", () => {
    expect(release({ runs: [] })).toEqual({
      pass: false,
      message: "Run the ai-tests workflow on this commit before releasing",
    });
  });

  it("failed run → fail", () => {
    expect(release({ runs: [run("failed")] }).pass).toBe(false);
  });

  it("passed run with a model that doesn't match src/config/models.ts → fail", () => {
    expect(release({ runs: [run("passed", { grader_model: "some-other-model" })] })).toEqual({
      pass: false,
      message:
        "The AI test run used a different model than src/config/models.ts. Run the ai-tests workflow with the configured models",
    });
  });

  it("passed run with matching models, owner tag on main → pass", () => {
    expect(release({ runs: [run("passed")] }).pass).toBe(true);
  });
});

describe("release workflow (X3)", () => {
  const workflow = readFileSync(
    new URL("../../../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );
  // Comment lines can mention things the workflow must not use, so leave them out.
  const code = workflow
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");

  it("runs on v* tags only", () => {
    expect(code).toMatch(/^on:\n {2}push:\n {4}tags:\n {6}- "v\*"\n\n/m);
    expect(code).not.toMatch(/^\s+branches:/m);
    expect(code).not.toMatch(/pull_request|workflow_dispatch/);
  });

  it("never uses pull_request_target (comment lines are ignored)", () => {
    expect(code).not.toMatch(/pull_request_target/);
  });

  it("has read-only repository access", () => {
    expect(code).toMatch(/^permissions:\n\s+contents: read\s*$/m);
    expect(code).not.toMatch(/: write\b/);
  });

  it("no job uses an environment (until T074b)", () => {
    expect(code).not.toMatch(/environment:/);
  });
});
