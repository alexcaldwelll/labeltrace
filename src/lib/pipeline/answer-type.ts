// T029: the AI safety net (FR-014; research R14 layer 2; owner's decision 1A, 2026-11-26).
//
// The answer AI labels every answer "normal", "not_covered", or "refusal". This turns
// the last two into the reply the person sees:
// - not_covered → "The label doesn't cover this." with the drug and label date. Never a
//   guess. ("Not covered" is used only when the AI says the label doesn't answer;
//   answers that fail the checks get the label pointer instead, T040.)
// - refusal → a refusal with the doctor-or-pharmacist wording (reason "backstop"), for a
//   question that got past the refusal rules.
// A "normal" answer returns null: it goes on to the answer checks (T040).
//
// The step that calls the answer AI for normal questions is built in T040, which uses
// this. No AI is called here.
import type { AnswerReply } from "@/lib/ai/types";
import { MSG_NOT_COVERED } from "@/lib/emergency/phrases";
import type { Drug } from "@/lib/labels/store";
import { MSG_BACKSTOP } from "@/lib/refusals/respond";

export type AnswerTypeReplyFields =
  | { kind: "not_covered"; text: string; drug: Drug; label_date: string }
  | { kind: "refusal"; reason: "backstop"; text: string };

/** The reply for an AI answer marked not_covered or refusal; null for a normal answer. */
export function replyForAnswerType(
  reply: AnswerReply,
  drug: Drug,
  labelDate: string,
): AnswerTypeReplyFields | null {
  switch (reply.answerType) {
    case "not_covered":
      return { kind: "not_covered", text: MSG_NOT_COVERED, drug, label_date: labelDate };
    case "refusal":
      return { kind: "refusal", reason: "backstop", text: MSG_BACKSTOP };
    case "normal":
      return null;
  }
}
