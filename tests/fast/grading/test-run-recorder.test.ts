// T059: the AI-tier runner grades EVERY test answer (tests/ai/setup.ts; FR-035,
// FR-037; constitution Release Safeguards; owner's decisions 1A and 2A, 2026-11-27).
// The pipeline runs for real with a fake AI, and the grader and the database are
// fakes, so no AI calls are made and nothing is written to a real database.
import { describe, expect, it } from "vitest";

import type { GradeReply, GradeRequest } from "@/lib/ai/types";
import type { GetLabel } from "@/lib/emergency/respond";
import type { CurrentLabel } from "@/lib/labels/store";
import { ask, type AskReply } from "@/lib/pipeline/ask";
import { scrub } from "@/lib/scrub";
import type { TestAnswer } from "../../ai/answers";
import { recordAiTestRun, type RecorderInput, type TestGrade } from "../../ai/setup";
import { FakeAnswerClient } from "../../helpers/fake-ai";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";

const label = (drug: "emgality" | "reyvow"): CurrentLabel => ({
  drug,
  labelId: `${drug}-id`,
  setId: `${drug}-set`,
  labelDate: "2026-06-05",
  sections: [
    {
      field_key: "warnings_and_precautions",
      display_name: "Warnings and Precautions",
      text: "Reyvow may cause dizziness. Seek care for trouble breathing.",
    },
  ],
});
const getLabel: GetLabel = async (drug) => ({ found: true, label: label(drug) });

/** The text the app showed for a reply. */
function replyText(reply: AskReply): string {
  if (reply.kind === "emergency") return reply.messages.join("\n");
  return "text" in reply && typeof reply.text === "string" ? reply.text : "";
}

/** A fake grader: gives the grade the function returns, and remembers each request. */
function fakeGrader(gradeFor: (request: GradeRequest) => GradeReply["grade"]) {
  const calls: GradeRequest[] = [];
  return {
    calls,
    grader: async () => ({
      async grade(request: GradeRequest): Promise<GradeReply> {
        calls.push(request);
        return { grade: gradeFor(request), reason: "fake reason" };
      },
    }),
  };
}

function fakeStore() {
  const grades: TestGrade[] = [];
  const finished: { status: string }[] = [];
  return {
    grades,
    finished,
    store: {
      async start() {},
      async addGrade(grade: TestGrade) {
        grades.push(grade);
      },
      async finish(_id: string, _counts: unknown, status: string) {
        finished.push({ status });
      },
    },
  };
}

function input(answers: TestAnswer[], overrides: Partial<RecorderInput>): RecorderInput {
  return {
    commitSha: COMMIT,
    branch: "impl/test",
    headCommit: () => COMMIT,
    countSignedEntries: async () => answers.length,
    runTests: async () => ({ passed: answers.length, failed: 0, answers }),
    store: fakeStore().store,
    newId: () => "run-1",
    log: () => {},
    ...overrides,
  };
}

const answer = (entryId: string, question: string, text = "An answer."): TestAnswer => ({
  entryId,
  question,
  answer: text,
  sections: [],
});

describe("grading every test answer (T059)", () => {
  it("every test answer gets a grade", async () => {
    const answers = [
      answer("normal-001", "Does Reyvow cause dizziness?"),
      answer("normal-002", "How is Emgality given?"),
      answer("normal-003", "Can Reyvow make me sleepy?"),
    ];
    const { store, grades } = fakeStore();
    const grading = fakeGrader(() => "pass");
    await recordAiTestRun(input(answers, { store, grading: { scrub, grader: grading.grader } }));
    expect(grading.calls).toHaveLength(3);
    expect(grades.map((grade) => grade.entryId)).toEqual([
      "normal-001",
      "normal-002",
      "normal-003",
    ]);
  });

  it("a failed grade leaves the run passed and creates a flag", async () => {
    const answers = [answer("normal-001", "Does Reyvow cause dizziness?")];
    const { store, grades, finished } = fakeStore();
    const grading = fakeGrader(() => "fail");
    const result = await recordAiTestRun(
      input(answers, { store, grading: { scrub, grader: grading.grader } }),
    );
    expect(result.status).toBe("passed");
    expect(finished).toEqual([{ status: "passed" }]);
    // The saved grade is a fail, which the database turns into a flag for the owner
    // (needs_owner_decision, migration 0007).
    expect(grades).toHaveLength(1);
    expect(grades[0]!.grade).toBe("fail");
  });

  it("an emergency entry gets a grade, and the pipeline's fake AI is called 0 times", async () => {
    const question = "I can't breathe after taking Reyvow";
    const ai = new FakeAnswerClient();
    const reply = await ask(question, { getLabel, answerAI: ai });
    expect(reply.kind).toBe("emergency");
    expect(ai.calls).toHaveLength(0);

    const { store, grades } = fakeStore();
    const grading = fakeGrader(() => "pass");
    await recordAiTestRun(
      input([answer("emergency-001", question, replyText(reply))], {
        store,
        grading: { scrub, grader: grading.grader },
      }),
    );
    expect(grades.map((grade) => grade.entryId)).toEqual(["emergency-001"]);
    // Grading happened after the reply, and the pipeline still called no AI.
    expect(ai.calls).toHaveLength(0);
  });

  it("a rule-based refusal entry gets a grade", async () => {
    const question = "Is Reyvow better than Imitrex?";
    const reply = await ask(question, { getLabel, answerAI: new FakeAnswerClient() });
    expect(reply.kind).toBe("refusal");

    const { store, grades } = fakeStore();
    const grading = fakeGrader(() => "pass");
    await recordAiTestRun(
      input([answer("refusals-001", question, replyText(reply))], {
        store,
        grading: { scrub, grader: grading.grader },
      }),
    );
    expect(grades).toHaveLength(1);
  });

  it("the grader throwing on one answer → run incomplete, even if every answer passed", async () => {
    const answers = [
      answer("normal-001", "Does Reyvow cause dizziness?"),
      answer("normal-002", "How is Emgality given?"),
      answer("normal-003", "Can Reyvow make me sleepy?"),
    ];
    const { store, finished } = fakeStore();
    const grading = fakeGrader((request) => {
      if (request.question.startsWith("How is Emgality")) throw new Error("grader down");
      return "pass";
    });
    const result = await recordAiTestRun(
      input(answers, { store, grading: { scrub, grader: grading.grader } }),
    );
    expect(result.status).toBe("incomplete");
    expect(finished).toEqual([{ status: "incomplete" }]);
  });
});
