// T019: sort a MEDICAL emergency match into a case (FR-047, FR-050;
// contracts/emergency-rules.md section 4). Plain code, no AI. Checked in this order:
//
// 1. Happening now: the question has any of these whole words (after normalizing):
//    i, i'm, im, me, my, we, now, today, having, or the two words "right now".
//    ("worst headache of my life" contains "my", so it is always happening now. That's
//    the safe result.)
// 2. Informational: a drug name spelled exactly (any capitals) AND the question starts
//    with a question word or ends with "?".
// 3. Unclear: everything else, including a misspelled drug name (for example "Reyvo").
import { normalize, words } from "@/lib/text/match";

export type EmergencyCase = "happening_now" | "informational" | "unclear";

export const HAPPENING_NOW_WORDS = [
  "i",
  "i'm",
  "im",
  "me",
  "my",
  "we",
  "now",
  "today",
  "having",
] as const;
export const DRUG_NAMES = ["emgality", "reyvow", "galcanezumab", "lasmiditan"] as const;
export const QUESTION_WORDS = [
  "does",
  "do",
  "can",
  "could",
  "is",
  "are",
  "will",
  "may",
  "should",
  "what",
  "how",
] as const;

export function classifyMedical(rawText: string): EmergencyCase {
  const textWords = words(rawText);
  const has = (word: string) => textWords.includes(word);

  if (HAPPENING_NOW_WORDS.some(has) || ` ${normalize(rawText)} `.includes(" right now ")) {
    return "happening_now";
  }

  const namesDrug = DRUG_NAMES.some(has);
  const first = textWords[0] ?? "";
  const asks =
    (QUESTION_WORDS as readonly string[]).includes(first) || rawText.trim().endsWith("?");
  if (namesDrug && asks) return "informational";

  return "unclear";
}
