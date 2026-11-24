// T012: tests for the fake AI (tests/helpers/fake-ai.ts).
//
// Other tests trust the fake to prove the AI was or wasn't called, so these tests
// check that it really writes down every call, not only that it gives fixed replies.
import { describe, expect, it } from "vitest";
import type { AnswerRequest, GradeRequest } from "@/lib/ai/types";
import type { ScrubbedText } from "@/lib/scrub/types";
import {
  DEFAULT_ANSWER_REPLY,
  DEFAULT_GRADE_REPLY,
  FakeAnswerClient,
  FakeGraderClient,
} from "../../helpers/fake-ai";

// Tests can't call scrub() yet (T033), so they make ScrubbedText on purpose here.
const question = "Can [NAME] take Reyvow with food?" as ScrubbedText;

const answerRequest: AnswerRequest = {
  question,
  drug: "reyvow",
  sections: [{ field_key: "dosage_and_administration", display_name: "Dosage and Administration", text: "Take with or without food." }],
  promptVersion: "answer-v1",
  deadline: 1_000,
};

const gradeRequest: GradeRequest = { question, sections: [], answer: "You can take it with or without food." };

describe("FakeAnswerClient", () => {
  it("has no calls before it is used", () => {
    expect(new FakeAnswerClient().calls).toEqual([]);
  });

  it("records a call when the AI is called", async () => {
    const ai = new FakeAnswerClient();
    await ai.answer(answerRequest);
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0]).toEqual(answerRequest);
  });

  it("records every call, in order", async () => {
    const ai = new FakeAnswerClient();
    const second = { ...answerRequest, drug: "emgality" as const };
    await ai.answer(answerRequest);
    await ai.answer(second);
    expect(ai.calls).toEqual([answerRequest, second]);
  });

  it("returns the default fixed reply", async () => {
    expect(await new FakeAnswerClient().answer(answerRequest)).toEqual(DEFAULT_ANSWER_REPLY);
  });

  it("returns a given fixed reply", async () => {
    const reply = { answer: "Not in the label.", sectionsUsed: [], answerType: "not_covered" as const };
    expect(await new FakeAnswerClient(reply).answer(answerRequest)).toEqual(reply);
  });

  it("still records the call when the reply throws", async () => {
    const ai = new FakeAnswerClient(() => {
      throw new Error("AI is down");
    });
    await expect(ai.answer(answerRequest)).rejects.toThrow("AI is down");
    expect(ai.calls).toEqual([answerRequest]);
  });
});

describe("FakeGraderClient", () => {
  it("has no calls before it is used", () => {
    expect(new FakeGraderClient().calls).toEqual([]);
  });

  it("records a call when the grader is called", async () => {
    const grader = new FakeGraderClient();
    await grader.grade(gradeRequest);
    expect(grader.calls).toEqual([gradeRequest]);
  });

  it("returns the default fixed reply, or a given one", async () => {
    expect(await new FakeGraderClient().grade(gradeRequest)).toEqual(DEFAULT_GRADE_REPLY);
    const fail = { grade: "fail" as const, reason: "Wrong fact." };
    expect(await new FakeGraderClient(fail).grade(gradeRequest)).toEqual(fail);
  });

  it("still records the call when the reply throws", async () => {
    const grader = new FakeGraderClient(async () => {
      throw new Error("Grader is down");
    });
    await expect(grader.grade(gradeRequest)).rejects.toThrow("Grader is down");
    expect(grader.calls).toEqual([gradeRequest]);
  });
});
