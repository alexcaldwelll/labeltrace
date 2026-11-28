// T059: how an AI-tier test hands its finished answer to the runner for grading
// (owner's decision 1A, 2026-11-27).
//
// Each answer test calls recordTestAnswer() with its Vitest test context. The answer
// is attached to that test's metadata, which Vitest sends back to the runner
// (tests/ai/setup.ts) when the tests finish. The runner then scrubs the question,
// grades the answer with the second-AI grader, and saves the grade.
//
// The question is the raw test question (made-up details only); the runner scrubs it
// before it goes to the grader or the database. The grader calibration test doesn't
// use this: its hand-made answers aren't test answers.
import type { TestContext } from "vitest";

import type { LabelSection } from "@/lib/labels/sections";

/** One finished test answer, waiting to be graded. */
export type TestAnswer = {
  /** The answer-key entry's id. */
  entryId: string;
  /** The raw test question (scrubbed by the runner before grading). */
  question: string;
  /** The reply text the app showed. */
  answer: string;
  /** The label sections behind the reply (may be empty, for example a refusal). */
  sections: LabelSection[];
};

declare module "vitest" {
  interface TaskMeta {
    testAnswer?: TestAnswer;
  }
}

/** Attaches a finished answer to this test, so the runner grades it. */
export function recordTestAnswer(context: Pick<TestContext, "task">, answer: TestAnswer): void {
  context.task.meta.testAnswer = answer;
}
