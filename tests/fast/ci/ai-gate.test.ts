// T015: the ai-gate decision (src/lib/ci/gate.ts) and its workflow
// (.github/workflows/ai-gate.yml). No GitHub or database calls: runs are made up.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ANSWER_MODEL, GRADER_MODEL } from "@/config/models";
import {
  MESSAGES,
  aiRelatedFiles,
  decideGate,
  parsePatterns,
  type Pattern,
  type TestRun,
} from "@/lib/ci/gate";

const REAL_LIST = readFileSync(
  new URL("../../../.github/ai-related-paths.txt", import.meta.url),
  "utf8",
);
const realPatterns = parsePatterns(REAL_LIST);
const models = { answer: ANSWER_MODEL.id, grader: GRADER_MODEL.id };

function run(status: string, overrides: Partial<TestRun> = {}): TestRun {
  return { status, answer_model: models.answer, grader_model: models.grader, ...overrides };
}

// Decides for a PR changing `files`, judged against the real list (both copies the same).
function gate(files: string[], runs: TestRun[] = []) {
  return decideGate({ aiFiles: aiRelatedFiles(files, realPatterns, realPatterns), runs, models });
}

// A made-up file that the pattern matches.
function exampleFile(pattern: Pattern): string {
  return pattern.kind === "folder" ? `${pattern.prefix}example.ts` : pattern.path;
}

describe("ai-gate decision", () => {
  it("README-only change → pass", () => {
    expect(gate(["README.md"]).pass).toBe(true);
  });

  describe("every pattern in the real .github/ai-related-paths.txt", () => {
    it("E1: the real list has at least one pattern (an empty list would let everything through)", () => {
      expect(realPatterns.length).toBeGreaterThan(0);
    });
    for (const pattern of realPatterns) {
      const file = exampleFile(pattern);
      it(`a change to ${file} with no run → fail`, () => {
        expect(gate([file])).toEqual({ pass: false, message: MESSAGES.noRun });
      });
    }
  });

  it("a change to .github/ai-related-paths.txt itself with no run → fail", () => {
    expect(gate([".github/ai-related-paths.txt"])).toEqual({
      pass: false,
      message: MESSAGES.noRun,
    });
  });

  it("prompt change with a passed run → pass", () => {
    expect(gate(["src/lib/prompts/grader-v1.ts"], [run("passed")]).pass).toBe(true);
  });

  it("prompt change whose only run is incomplete → fail with the incomplete message", () => {
    expect(gate(["src/lib/prompts/grader-v1.ts"], [run("incomplete")])).toEqual({
      pass: false,
      message: "The AI test run is incomplete. Run the ai-tests workflow again",
    });
  });

  it("E2: prompt change whose only run failed → fail with the failed message (D2)", () => {
    expect(gate(["src/lib/prompts/grader-v1.ts"], [run("failed")])).toEqual({
      pass: false,
      message: "The AI test run failed. Fix the failures and run the ai-tests workflow again",
    });
  });

  for (const which of ["answer_model", "grader_model"] as const) {
    it(`a passed run whose ${which} doesn't match src/config/models.ts → fail`, () => {
      expect(
        gate(["src/lib/prompts/grader-v1.ts"], [run("passed", { [which]: "some-other-model" })]),
      ).toEqual({
        pass: false,
        message:
          "The AI test run used a different model than src/config/models.ts. Run the ai-tests workflow with the configured models",
      });
    });
  }

  it("comment lines are ignored", () => {
    const patterns = parsePatterns("# src/lib/secret/**\n\n  # also a comment\nsrc/lib/ai/**\n");
    expect(patterns).toEqual([{ kind: "folder", prefix: "src/lib/ai/" }]);
    expect(aiRelatedFiles(["src/lib/secret/x.ts"], patterns)).toEqual([]);
  });

  it("D1: a file named only in main's list still counts after the PR removes that line", () => {
    const mainList = parsePatterns("src/lib/prompts/**\n.github/ai-related-paths.txt\n");
    const prList = parsePatterns(".github/ai-related-paths.txt\n");
    const changed = ["src/lib/prompts/grader-v1.ts", ".github/ai-related-paths.txt"];
    expect(aiRelatedFiles(changed, mainList, prList)).toEqual(changed);
    const result = decideGate({
      aiFiles: aiRelatedFiles(changed, mainList, prList),
      runs: [],
      models,
    });
    expect(result).toEqual({ pass: false, message: MESSAGES.noRun });
  });

  describe("X2: unsupported pattern shapes are refused", () => {
    for (const line of ["src/*.ts", "src/**/x.ts", "*", "src/lib/ai/*"]) {
      it(`refuses "${line}"`, () => {
        expect(() => parsePatterns(`${line}\n`)).toThrow(
          `Unsupported pattern in .github/ai-related-paths.txt: ${line}`,
        );
      });
    }
  });
});

describe("ai-gate workflow (X1)", () => {
  const workflow = readFileSync(
    new URL("../../../.github/workflows/ai-gate.yml", import.meta.url),
    "utf8",
  );
  // Comment lines can mention things the workflow must not use, so leave them out.
  const code = workflow
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");

  it("runs on pull_request", () => {
    expect(code).toMatch(/^on:\n(?:.*\n)*?\s+pull_request:\s*$/m);
  });

  it("never uses pull_request_target (comment lines are ignored)", () => {
    expect(code).not.toMatch(/pull_request_target/);
  });

  it("checks out the PR's latest commit", () => {
    expect(code).toMatch(/^\s+ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}\s*$/m);
  });

  it("has read-only repository access", () => {
    expect(code).toMatch(/^permissions:\n\s+contents: read\s*$/m);
    expect(code).not.toMatch(/: write\b/);
  });
});

describe("X2: scripts/ai-gate.ts --changes-only", () => {
  const SCRIPT = fileURLToPath(new URL("../../../scripts/ai-gate.ts", import.meta.url));

  // A throwaway git repository with its own list and two commits: a base commit, then
  // a commit that changes `changedFile`.
  function tryChange(changedFile: string) {
    const dir = mkdtempSync(join(tmpdir(), "changes-only-"));
    const git = (...args: string[]) =>
      execFileSync(
        "git",
        ["-c", "user.name=test", "-c", "user.email=test@example.invalid", ...args],
        {
          cwd: dir,
          encoding: "utf8",
        },
      ).trim();
    git("init", "-q", "-b", "main");
    mkdirSync(join(dir, ".github"));
    writeFileSync(join(dir, ".github/ai-related-paths.txt"), "src/lib/prompts/**\n");
    writeFileSync(join(dir, "README.md"), "start\n");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    const base = git("rev-parse", "HEAD");
    mkdirSync(join(dir, changedFile, ".."), { recursive: true });
    writeFileSync(join(dir, changedFile), "changed\n");
    git("add", "-A");
    git("commit", "-q", "-m", "change");
    const head = git("rev-parse", "HEAD");
    const output = join(dir, "github-output.txt");
    writeFileSync(output, "");
    const env: NodeJS.ProcessEnv = { ...process.env, BASE_SHA: base, HEAD_SHA: head };
    env.GITHUB_OUTPUT = output;
    delete env.AI_GATE_DATABASE_URL;
    execFileSync(process.execPath, [SCRIPT, "--changes-only"], { cwd: dir, env, encoding: "utf8" });
    return readFileSync(output, "utf8");
  }

  it("README-only change → ai=false", () => {
    expect(tryChange("README.md")).toBe("ai=false\n");
  });

  it("prompt change → ai=true, without AI_GATE_DATABASE_URL", () => {
    expect(tryChange("src/lib/prompts/answer-v1.ts")).toBe("ai=true\n");
  });
});
