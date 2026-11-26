// T013: decides if a question is in English (research R19, FR-055).
//
// This matters for privacy: the personal-details scrubber only works on English, so a
// question that isn't English is never scrubbed or logged with its text. The
// emergency path uses this same check before saving its log row (T047).
//
// The rule:
// 1. If every word is an English word, one of our drug names, or a number, the
//    question is English. This is the only way a question under 30 characters can
//    count as English, because language detection often gets short text wrong
//    ("chest pain?" is English; "¿Reyvow causa náuseas?" is not).
// 2. Otherwise, a question of 30 characters or more is English only if the
//    franc-min language detector says it is.
//
// Rule 1 also applies to longer questions. franc-min can get plain English wrong
// even at 40 characters (it reads "Can I drive after taking Reyvow tablets?" as
// Dutch), and a question made only of English words is safe to treat as English.
//
// A question with no words at all (like "???") is not counted as English.
import { franc } from "franc-min";

import { isDrugNameWord } from "@/lib/refusals/drug-names";
import englishWords from "./english-words.json";

/** Questions shorter than this must pass rule 1 to count as English. */
export const SHORT_QUESTION_LENGTH = 30;

/**
 * Our own 4 names, which always count as words. Every other drug name and drug-class
 * word, including misspellings like "Imitrx" (T016's typo rules), counts through
 * isDrugNameWord() (T024, src/lib/refusals/drug-names.ts).
 */
export const LANGUAGE_DRUG_NAMES: ReadonlySet<string> = new Set([
  "emgality",
  "galcanezumab",
  "reyvow",
  "lasmiditan",
]);

const ENGLISH_WORDS: ReadonlySet<string> = new Set(englishWords.words);

// A word is letters and digits, maybe joined by apostrophes ("can't", "Reyvow's").
// \p{L} is any letter in any language, \p{M} is accent marks, \p{N} is digits.
const WORD = /[\p{L}\p{M}\p{N}]+(?:'[\p{L}\p{M}\p{N}]+)*/gu;
const NUMBER = /^\d+(?:[.,]\d+)*$/;

/** The question's words, lowercase, with curly apostrophes made straight. */
function wordsOf(text: string): string[] {
  const normal = text.normalize("NFC").toLowerCase().replace(/[‘’]/g, "'");
  return normal.match(WORD) ?? [];
}

function isKnownWord(word: string): boolean {
  if (NUMBER.test(word)) return true;
  if (ENGLISH_WORDS.has(word) || LANGUAGE_DRUG_NAMES.has(word)) return true;
  // "Reyvow's" counts if "Reyvow" does.
  if (word.endsWith("'s")) {
    const base = word.slice(0, -2);
    if (ENGLISH_WORDS.has(base) || LANGUAGE_DRUG_NAMES.has(base)) return true;
  }
  return isDrugNameWord(word);
}

/** True if `question` counts as English under the rule at the top of this file. */
export function isEnglish(question: string): boolean {
  const text = question.trim();
  const words = wordsOf(text);
  if (words.length === 0) return false;
  if (words.every(isKnownWord)) return true;
  if (text.length < SHORT_QUESTION_LENGTH) return false;
  return franc(text) === "eng";
}
