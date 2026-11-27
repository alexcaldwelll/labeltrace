// T029: the AI safety net (src/lib/pipeline/answer-type.ts; FR-014; research R14 layer 2).
import { describe, expect, it } from "vitest";
import type { AnswerRequest } from "@/lib/ai/types";
import { replyForAnswerType } from "@/lib/pipeline/answer-type";
import type { ScrubbedText } from "@/lib/scrub/types";
import { FakeAnswerClient } from "../../helpers/fake-ai";

// Tests can't call scrub() yet (T033), so they make ScrubbedText on purpose here.
const request: AnswerRequest = {
  question: "Can I take Reyvow on a plane?" as ScrubbedText,
  drug: "reyvow",
  sections: [],
  promptVersion: "answer-v1",
  deadline: Date.now() + 8000,
};

describe("the answer AI's own labels", () => {
  it("fake AI says not_covered → exact text", async () => {
    const ai = new FakeAnswerClient({ answer: "", sectionsUsed: [], answerType: "not_covered" });
    const reply = await ai.answer(request);
    expect(replyForAnswerType(reply, "reyvow", "2026-06-05")).toEqual({
      kind: "not_covered",
      text: "The label doesn't cover this.",
      drug: "reyvow",
      label_date: "2026-06-05",
    });
  });

  it("fake AI says refusal → refusal reply with doctor or pharmacist wording", async () => {
    const ai = new FakeAnswerClient({ answer: "", sectionsUsed: [], answerType: "refusal" });
    const reply = await ai.answer(request);
    expect(replyForAnswerType(reply, "emgality", "2026-06-05")).toEqual({
      kind: "refusal",
      reason: "backstop",
      text: "I can't answer that from the label. Please talk to your doctor or pharmacist.",
    });
  });
});
