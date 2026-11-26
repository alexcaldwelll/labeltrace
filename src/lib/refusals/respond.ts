// T027: the refusal replies (FR-011, FR-012, FR-013, FR-019; contracts/api.md).
//
// - Comparison, other drug, and which drug: fixed text from this file. No AI call.
// - Personal dosing: "Ask your doctor or pharmacist" plus a summary of the label's
//   "Dosage and Administration" section, written by the answer AI with the dosing-v1
//   prompt from that section only. The AI gets a fixed app sentence, never the
//   question (decision 3A).
//
// If the dosing summary can't be made (no AI yet, the AI fails or doesn't answer, or
// the label or section can't be read), the outcome is "unavailable" and the page says
// "try again later". Nothing is made up. T028 replaces this with the label's own
// section text, word for word.
//
// The message wording was approved by the owner on 2026-11-26. The grader
// (src/lib/prompts/grader-v1.ts) uses the two doctor/pharmacist phrases from here, so
// they can't drift.
import type { AnswerClient } from "@/lib/ai/types";
import type { GetLabel } from "@/lib/emergency/respond";
import type { Drug } from "@/lib/labels/store";
import { DOSING_PROMPT_VERSION, DOSING_REQUEST, DOSING_SECTION_KEY } from "@/lib/prompts/dosing-v1";
import { appText } from "@/lib/scrub/types";
import { applyRefusalRules } from "./rules";

/** The personal-dosing wording (FR-011). */
export const ASK_DOCTOR = "Ask your doctor or pharmacist";
/** The comparison and other-drug wording (FR-012, FR-013). */
export const TALK_TO_DOCTOR = "talk to your doctor or pharmacist";

export const MSG_COMPARISON = `I can't compare medicines. Please ${TALK_TO_DOCTOR} about which one is right for you.`;
export const MSG_OTHER_DRUG = `I can only answer questions about Emgality and Reyvow. For other medicines, please ${TALK_TO_DOCTOR}.`;
export const MSG_ASK_WHICH_DRUG = "Do you mean Emgality or Reyvow?";

const DRUG_NAMES: Record<Drug, string> = { emgality: "Emgality", reyvow: "Reyvow" };

/** The words shown before the dosing summary. */
export function dosingLead(drug: Drug): string {
  return `I can't tell you how much to take. ${ASK_DOCTOR} about your own dose. Here is what the ${DRUG_NAMES[drug]} label says about dosing in general:`;
}

/** How long the dosing summary may take, in milliseconds (the whole reply has 9 s, R13). */
export const DOSING_TIME_LIMIT_MS = 8000;

/** The reply fields for a refusal or a which-drug question (ask.ts adds the disclaimer). */
export type RefusalReplyFields =
  | { kind: "refusal"; reason: "comparison" | "other_drug"; text: string }
  | {
      kind: "refusal";
      reason: "personal_dosing";
      text: string;
      sections: string[];
      label_date: string;
      prompt_version: typeof DOSING_PROMPT_VERSION;
      /** Only when the drug name was misspelled (decision 5A). */
      typed_as?: string;
    }
  | { kind: "ask_which_drug"; text: string };

export type RefusalOutcome =
  | { kind: "reply"; reply: RefusalReplyFields }
  /** Personal dosing, but the summary couldn't be made: show "try again later". */
  | { kind: "unavailable" }
  /** Not refused: the question goes on to the answer steps. */
  | { kind: "pass"; drug: Drug | "both"; typedAs: Partial<Record<Drug, string>> };

export interface RefusalDeps {
  getLabel: GetLabel;
  /** The answer AI. Not there until T039; dosing is then "unavailable". */
  answerAI?: AnswerClient;
}

/** Step 4: applies the refusal rules and builds the reply. */
export async function buildRefusalReply(
  question: string,
  deps: RefusalDeps,
): Promise<RefusalOutcome> {
  const result = applyRefusalRules(question);
  switch (result.kind) {
    case "comparison":
      return {
        kind: "reply",
        reply: { kind: "refusal", reason: "comparison", text: MSG_COMPARISON },
      };
    case "other_drug":
      return {
        kind: "reply",
        reply: { kind: "refusal", reason: "other_drug", text: MSG_OTHER_DRUG },
      };
    case "ask_which_drug":
      return { kind: "reply", reply: { kind: "ask_which_drug", text: MSG_ASK_WHICH_DRUG } };
    case "pass":
      return { kind: "pass", drug: result.drug, typedAs: result.typedAs };
    case "personal_dosing":
      return personalDosing(result.drug, result.typedAs, deps);
  }
}

async function personalDosing(
  drug: Drug,
  typedAs: string | undefined,
  deps: RefusalDeps,
): Promise<RefusalOutcome> {
  if (!deps.answerAI) return { kind: "unavailable" };
  try {
    const result = await deps.getLabel(drug);
    if (!result.found) return { kind: "unavailable" };
    const section = result.label.sections.find((s) => s.field_key === DOSING_SECTION_KEY);
    if (!section) return { kind: "unavailable" };
    const reply = await deps.answerAI.answer({
      question: appText(DOSING_REQUEST),
      drug,
      sections: [section],
      promptVersion: DOSING_PROMPT_VERSION,
      deadline: Date.now() + DOSING_TIME_LIMIT_MS,
    });
    if (reply.answerType !== "normal" || reply.answer.trim() === "") {
      return { kind: "unavailable" };
    }
    return {
      kind: "reply",
      reply: {
        kind: "refusal",
        reason: "personal_dosing",
        text: `${dosingLead(drug)} ${reply.answer.trim()}`,
        sections: [section.display_name],
        label_date: result.label.labelDate,
        prompt_version: DOSING_PROMPT_VERSION,
        ...(typedAs ? { typed_as: typedAs } : {}),
      },
    };
  } catch {
    return { kind: "unavailable" };
  }
}
