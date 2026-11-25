// T013: the steps every question goes through, in this fixed order.
//
//   1. Emergency check       (T022) on the FULL question, before anything else
//   2. Basic checks          (T013) blank, too long, not English
//   3. Scrub                 (T033) mask personal details before any AI or log sees them
//   4. Refusals              (T027) dosing, comparisons, other drugs, which drug
//   5. Section search        (T040) find the label sections that answer the question
//   6. Answer AI             (T040) write the answer from those sections only
//   7. Answer checks         (T040, T044) word count, reading level, citations
//   8. Log                   (T047) exactly one row for every reply
//   9. Grading sample        (T057) pick some AI answers for the grader
//
// Steps 1 and 2 work so far. The other steps are empty slots that later tasks fill
// in. A question that gets past step 2 gets a "try again later" reply for now, so
// nothing is ever made up.
//
// Privacy: the raw question stays in memory only. This file never logs, saves, or
// sends it back in a reply (FR-021).
import type { AnswerClient } from "@/lib/ai/types";
import {
  buildEmergencyReply,
  type EmergencyReplyFields,
  type GetLabel,
} from "@/lib/emergency/respond";
import { isEnglish } from "./language";

/** Shown on every reply (FR-003). */
export const DISCLAIMER = "LabelTrace is an AI, not a doctor." as const;

/** Longer questions are cut to this many characters. */
export const MAX_QUESTION_LENGTH = 1000;

export const PROMPT_FOR_QUESTION_TEXT = "Please type a question.";
export const ENGLISH_ONLY_TEXT = "I can only answer in English right now.";
export const TRY_AGAIN_TEXT = "Sorry, I can't answer right now. Please try again later.";

type ReplyBase = {
  disclaimer: typeof DISCLAIMER;
  /** Only there (and true) when the question was cut to 1,000 characters. */
  truncated?: true;
};

/** Replies from contracts/api.md. Later tasks add the other kinds. */
export type AskReply = ReplyBase &
  (
    | { kind: "prompt_for_question"; text: string }
    | { kind: "english_only"; text: string }
    | { kind: "try_again"; text: string }
    | EmergencyReplyFields
  );

/**
 * What the steps use. Tests pass fakes; the real ones are used when nothing is
 * passed. The answer AI isn't used by any step yet (T040); emergency tests pass a
 * fake one to prove it is never called.
 */
export interface AskDeps {
  /** Reads a drug's current saved label (default: the database, T011). */
  getLabel?: GetLabel;
  answerAI?: AnswerClient;
}

/** The real label lookup, loaded only when an emergency question needs a label. */
const getSavedLabel: GetLabel = async (drug) => {
  const { getCurrentLabel } = await import("@/lib/labels/store");
  return getCurrentLabel(drug);
};

type BasicChecksResult =
  { done: true; reply: AskReply } | { done: false; text: string; truncated: boolean };

/**
 * Step 2: blank → ask for a question; over 1,000 characters → cut; not English →
 * English only. Runs after the emergency check, which sees the full question.
 */
export function basicChecks(question: string): BasicChecksResult {
  if (question.trim() === "") {
    return {
      done: true,
      reply: {
        kind: "prompt_for_question",
        text: PROMPT_FOR_QUESTION_TEXT,
        disclaimer: DISCLAIMER,
      },
    };
  }
  const truncated = question.length > MAX_QUESTION_LENGTH;
  const text = truncated ? question.slice(0, MAX_QUESTION_LENGTH) : question;
  if (!isEnglish(text)) {
    return {
      done: true,
      reply: withTruncated(
        { kind: "english_only", text: ENGLISH_ONLY_TEXT, disclaimer: DISCLAIMER },
        truncated,
      ),
    };
  }
  return { done: false, text, truncated };
}

function withTruncated(reply: AskReply, truncated: boolean): AskReply {
  return truncated ? { ...reply, truncated: true } : reply;
}

/** Runs a question through the steps and returns the reply. */
export async function ask(question: string, deps: AskDeps = {}): Promise<AskReply> {
  const reply = await answer(question, deps);

  // Step 8: log (T047). Exactly one row for every reply, including blank and
  // non-English ones (those rows hold no question text, FR-055).

  // Step 9: grading sample (T057).

  return reply;
}

async function answer(question: string, deps: AskDeps): Promise<AskReply> {
  // Step 1: emergency check (T022, FR-004, FR-008). Runs on the full raw question,
  // in memory, before the 1,000-character cut, the language check, scrubbing, and
  // everything else, so an emergency phrase anywhere is still caught. A match
  // returns right away: the question never reaches any AI.
  const emergency = await buildEmergencyReply(question, deps.getLabel ?? getSavedLabel);
  if (emergency) return { ...emergency, disclaimer: DISCLAIMER };

  // Step 2: basic checks.
  const basic = basicChecks(question);
  if (basic.done) return basic.reply;

  // Step 3: scrub (T033).
  // Step 4: refusals (T027).
  // Step 5: section search (T040).
  // Step 6: answer AI (T040).
  // Step 7: answer checks (T040, T044).

  return withTruncated(
    { kind: "try_again", text: TRY_AGAIN_TEXT, disclaimer: DISCLAIMER },
    basic.truncated,
  );
}
