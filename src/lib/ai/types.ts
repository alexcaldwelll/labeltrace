// T012: the shapes of the two AI clients.
//
// This file holds no AI code. It only says what goes into each client and what
// comes out, so the real clients (T039, T056) and the fake one the tests use
// (tests/helpers/fake-ai.ts) all fit the same shape.
//
// Question text goes in only as ScrubbedText, so raw text can't reach an AI.
import type { LabelSection } from "@/lib/labels/sections";
import type { Drug } from "@/lib/labels/store";
import type { ScrubbedText } from "@/lib/scrub/types";

/** What the answer AI is asked. */
export type AnswerRequest = {
  /** The user's question, after scrubbing. */
  question: ScrubbedText;
  drug: Drug;
  /** The label sections the answer must come from (FR-002). */
  sections: readonly LabelSection[];
  /** Which prompt to use, like "answer-v1" or "dosing-v1". */
  promptVersion: string;
  /** When the reply must be done, in milliseconds since 1970 (research R13). */
  deadline: number;
};

/** What the answer AI says back. */
export type AnswerReply = {
  answer: string;
  /** The section names (display names) the answer says it used. */
  sectionsUsed: string[];
  /** "normal" for an answer, or why the AI didn't answer. */
  answerType: "normal" | "not_covered" | "refusal";
};

/** The answer AI client (the real one is T039). */
export interface AnswerClient {
  answer(request: AnswerRequest): Promise<AnswerReply>;
}

/** What the grader AI is asked. */
export type GradeRequest = {
  /** The question, after scrubbing. */
  question: ScrubbedText;
  /** The label sections behind the answer. May be empty (for example, emergency replies). */
  sections: readonly LabelSection[];
  /** The answer being graded. */
  answer: string;
};

/** What the grader AI says back. */
export type GradeReply = {
  grade: "pass" | "fail";
  /** A short reason for the grade. */
  reason: string;
};

/** The grader AI client (the real one is T056). */
export interface GraderClient {
  grade(request: GradeRequest): Promise<GradeReply>;
}
