// T012: a stand-in AI for tests.
//
// It never calls a real AI. It gives back fixed replies and writes down every call,
// so a test can prove the AI was called (and with what), or was never called at all.
// Emergency tests rely on this to prove the AI isn't called, so this file is on the
// AI-related list (.github/ai-related-paths.txt).
import type {
  AnswerClient,
  AnswerReply,
  AnswerRequest,
  GradeReply,
  GradeRequest,
  GraderClient,
} from "@/lib/ai/types";

/** A fixed reply, or a function that makes one from the request (it may throw). */
type Reply<Req, Res> = Res | ((request: Req) => Res | Promise<Res>);

async function makeReply<Req, Res>(reply: Reply<Req, Res>, request: Req): Promise<Res> {
  return typeof reply === "function"
    ? (reply as (request: Req) => Res | Promise<Res>)(request)
    : reply;
}

export const DEFAULT_ANSWER_REPLY: AnswerReply = {
  answer: "Fake answer.",
  sectionsUsed: [],
  answerType: "normal",
};

export const DEFAULT_GRADE_REPLY: GradeReply = { grade: "pass", reason: "Fake grade." };

/** A fake answer AI. `calls` lists every request, in order. */
export class FakeAnswerClient implements AnswerClient {
  readonly calls: AnswerRequest[] = [];

  constructor(private readonly reply: Reply<AnswerRequest, AnswerReply> = DEFAULT_ANSWER_REPLY) {}

  async answer(request: AnswerRequest): Promise<AnswerReply> {
    // Write the call down first, so it counts even if the reply throws.
    this.calls.push(request);
    return makeReply(this.reply, request);
  }
}

/** A fake grader AI. `calls` lists every request, in order. */
export class FakeGraderClient implements GraderClient {
  readonly calls: GradeRequest[] = [];

  constructor(private readonly reply: Reply<GradeRequest, GradeReply> = DEFAULT_GRADE_REPLY) {}

  async grade(request: GradeRequest): Promise<GradeReply> {
    this.calls.push(request);
    return makeReply(this.reply, request);
  }
}
