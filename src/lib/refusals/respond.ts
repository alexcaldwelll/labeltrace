// T027: the refusal replies (FR-011, FR-012, FR-013, FR-019; contracts/api.md).
//
// - Comparison, other drug, and which drug: fixed text from this file. No AI call.
// - Personal dosing: "Ask your doctor or pharmacist" plus a summary of the label's
//   "Dosage and Administration" section, written by the answer AI with the dosing-v1
//   prompt from that section only. The AI gets a fixed app sentence, never the
//   question (decision 3A).
//
// If the summary can't be used (no AI yet, the AI fails or doesn't answer, or a number
// or unit in it isn't in the label: T028), the "Dosage and Administration" section is
// shown word for word instead (spec PC-7). Only when the label or that section can't be
// read is the outcome "unavailable" ("try again later"). Nothing is made up.
//
// The message wording was approved by the owner on 2026-11-26. The grader
// (src/lib/prompts/grader-v1.ts) uses the two doctor/pharmacist phrases from here, so
// they can't drift.
import type { AnswerClient } from "@/lib/ai/types";
import type { GetLabel } from "@/lib/emergency/respond";
import { checkDosingNumbers } from "@/lib/checks/dosing-numbers";
import type { CurrentLabel, Drug } from "@/lib/labels/store";
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
/** When the answer AI marks its answer `refusal` (T029, owner-approved 2026-11-26). */
export const MSG_BACKSTOP = `I can't answer that from the label. Please ${TALK_TO_DOCTOR}.`;

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
      /** Which drug's dosing is shown (for "Answering about Reyvow …"). */
      drug: Drug;
      text: string;
      sections: string[];
      label_date: string;
      /** "ai_summary" when the AI's summary is shown; "label_text" for the fallback. */
      dosing_source: "ai_summary" | "label_text";
      /** Only when the AI's summary is shown. */
      prompt_version?: typeof DOSING_PROMPT_VERSION;
      /** Only when the drug name was misspelled (decision 5A). */
      typed_as?: string;
    }
  | { kind: "ask_which_drug"; text: string };

export type RefusalOutcome =
  | { kind: "reply"; reply: RefusalReplyFields }
  /** Personal dosing, but the label or its dosing section can't be read: "try again later". */
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
  // Without the label's dosing section there is no real text to show.
  let label: CurrentLabel;
  try {
    const result = await deps.getLabel(drug);
    if (!result.found) return { kind: "unavailable" };
    label = result.label;
  } catch {
    return { kind: "unavailable" };
  }
  const section = label.sections.find((s) => s.field_key === DOSING_SECTION_KEY);
  if (!section) return { kind: "unavailable" };

  const base = {
    kind: "refusal" as const,
    reason: "personal_dosing" as const,
    drug,
    sections: [section.display_name],
    label_date: label.labelDate,
    ...(typedAs ? { typed_as: typedAs } : {}),
  };
  // T028 fallback (spec PC-7): the section text, word for word. No AI text is shown,
  // so there is no prompt_version.
  const labelText: RefusalOutcome = {
    kind: "reply",
    reply: { ...base, text: `${dosingLead(drug)} ${section.text}`, dosing_source: "label_text" },
  };

  // No answer AI yet (until T039) counts the same as the AI being down.
  if (!deps.answerAI) return labelText;
  let summary: string;
  try {
    const reply = await deps.answerAI.answer({
      question: appText(DOSING_REQUEST),
      drug,
      sections: [section],
      promptVersion: DOSING_PROMPT_VERSION,
      deadline: Date.now() + DOSING_TIME_LIMIT_MS,
    });
    // The AI said the label doesn't cover it, or refused: show the label's own text.
    if (reply.answerType !== "normal" || reply.answer.trim() === "") return labelText;
    summary = reply.answer.trim();
  } catch {
    return labelText;
  }
  // T028: every number and unit in the summary must be in the section text exactly.
  if (!checkDosingNumbers(summary, section.text).ok) return labelText;
  return {
    kind: "reply",
    reply: {
      ...base,
      text: `${dosingLead(drug)} ${summary}`,
      dosing_source: "ai_summary",
      prompt_version: DOSING_PROMPT_VERSION,
    },
  };
}
