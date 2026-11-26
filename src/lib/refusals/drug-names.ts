// T024 + T026: drug names, and finding them in a question (research R14, R20; FR-013,
// FR-056). Plain code, no AI.
//
// Three lists:
// - Our names: Emgality, galcanezumab → emgality; Reyvow, lasmiditan → reyvow.
// - Other drugs: other-drugs.json, built from openFDA by scripts/build-drug-names.ts.
// - Drug-class words (DRUG_CLASS_WORDS, DRUG_CLASS_PHRASES): hand-written and reviewed
//   by the owner (2026-11-26), like the emergency phrase list. openFDA has no field with
//   the class words people type ("SSRI", "beta blocker"). A class word counts as
//   another drug.
//
// How a word is matched (findDrugs):
// 1. "'s" is ignored ("Reyvow's" → reyvow). An exact match (or exact plus a plural
//    "s": "triptans", "NSAIDs") wins over any typo match.
// 2. A word on the everyday English word list is never treated as a typo (owner's
//    decision 2A, 2026-11-26): "clarity" isn't Claritin, "diabetic" isn't diuretic.
//    And a misspelled word that is at least as close to an English word as to another
//    drug's name isn't that drug (closer-English rule, 2026-11-26): "migrane" is
//    migraine, not the product "migraide". The trade-off: a misspelled drug name near an English word
//    passes the rules and relies on the AI backstop (docs/risk-review-notes.md).
// 3. Otherwise a word within T016's typo allowance of a name counts as that name
//    ("Reyvo" → Reyvow, "Imitrx" → Imitrex). The closest name wins; if one of our names
//    and another drug are equally close, it counts as the other drug (refused, the
//    safer choice).
// 4. Two-word class phrases ("beta blocker") must match exactly, ignoring capitals,
//    punctuation, and a plural "s" on the last word.
//
// This is only for normal questions. The emergency path uses exact names (PC-1).
import { DRUG_NAME_TO_BRAND } from "@/lib/emergency/excerpts";
// Type-only import: nothing from the server-only label store is loaded here.
import type { Drug } from "@/lib/labels/store";
import englishWords from "@/lib/pipeline/english-words.json";
import { allowedChanges, editDistance, words } from "@/lib/text/match";
import otherDrugs from "./other-drugs.json";

/** Our 4 names → the brand whose label is used. */
export const OUR_DRUG_NAMES: Readonly<Record<string, Drug>> = DRUG_NAME_TO_BRAND;

/** Single-word drug classes, owner-reviewed 2026-11-26. Each counts as another drug. */
export const DRUG_CLASS_WORDS = [
  // The owner's list
  "triptan",
  "ssri",
  "snri",
  "nsaid",
  "opioid",
  "antidepressant",
  "maoi",
  // Moved here so one rule covers every class word
  "antibiotic",
  "antacid",
  "laxative",
  "anesthetic",
  "antifungal",
  // Proposed extras, approved
  "antihistamine",
  "steroid",
  "statin",
  "benzodiazepine",
  "anticonvulsant",
  "antipsychotic",
  "stimulant",
  "sedative",
  "depressant",
  "decongestant",
  "painkiller",
  "contraceptive",
  "tricyclic",
  "gepant",
  "ergot",
  // The owner's additions
  "antiemetic",
  "antinausea",
  "anticoagulant",
  "diuretic",
  "antiviral",
] as const;

/** Two-word drug classes, owner-reviewed 2026-11-26. Matched exactly. */
export const DRUG_CLASS_PHRASES = [
  "beta blocker",
  "birth control",
  "blood thinner",
  "muscle relaxant",
  "sleeping pill",
  "mao inhibitor",
  "anti nausea",
] as const;

/**
 * Never counted as another drug: words that describe our own drugs, and words too
 * general to mean another drug (owner's decision, 2026-11-26). The build script also
 * keeps them out of other-drugs.json.
 */
export const NEVER_OTHER_DRUG: ReadonlySet<string> = new Set([
  "cgrp",
  "ditan",
  "antibody",
  "monoclonal",
  "serotonin",
  "medicine",
  "medication",
  "drug",
  "vitamin",
  "supplement",
]);

/** Every single-word other-drug name: the openFDA list plus the class words. */
export const OTHER_DRUG_NAMES: ReadonlySet<string> = new Set([
  ...otherDrugs.names,
  ...DRUG_CLASS_WORDS,
]);

const ENGLISH_WORDS: ReadonlySet<string> = new Set(englishWords.words);

/** A drug named in the question. `typedAs` is there only for a typo match. */
export type DrugMention =
  | { kind: "ours"; drug: Drug; typedAs?: string }
  | { kind: "other"; name: string; typedAs?: string };

/** "reyvow's" → "reyvow". */
function withoutPossessive(word: string): string {
  return word.endsWith("'s") ? word.slice(0, -2) : word;
}

/** The exact forms to try: the word, and the word without a plural "s". */
function exactForms(word: string): string[] {
  return word.length > 4 && word.endsWith("s") ? [word, word.slice(0, -1)] : [word];
}

/** Matches one word against the name lists. Returns null when it isn't a drug name. */
export function matchDrugWord(typed: string): DrugMention | null {
  const word = withoutPossessive(typed);
  if (word.length === 0 || NEVER_OTHER_DRUG.has(word)) return null;

  // 1. Exact match (with or without a plural "s"). Our names first.
  for (const form of exactForms(word)) {
    const ours = OUR_DRUG_NAMES[form];
    if (ours) return { kind: "ours", drug: ours };
  }
  for (const form of exactForms(word)) {
    if (NEVER_OTHER_DRUG.has(form)) return null;
    if (OTHER_DRUG_NAMES.has(form)) return { kind: "other", name: form };
  }

  // 2. An everyday English word is never a typo (decision 2A). Numbers aren't either.
  if (ENGLISH_WORDS.has(word) || /^\d/.test(word)) return null;

  // 3. Typo match: the closest name within its allowance. Ties go to another drug.
  let bestOurs: { name: string; changes: number } | null = null;
  for (const name of Object.keys(OUR_DRUG_NAMES)) {
    const changes = withinAllowance(word, name);
    if (changes !== null && (bestOurs === null || changes < bestOurs.changes)) {
      bestOurs = { name, changes };
    }
  }
  let bestOther: { name: string; changes: number } | null = null;
  for (const name of OTHER_DRUG_NAMES) {
    const changes = withinAllowance(word, name);
    if (changes !== null && (bestOther === null || changes < bestOther.changes)) {
      bestOther = { name, changes };
    }
  }
  // Closer-English rule (owner's decision 2026-11-26): a misspelled word that is at
  // least as close to an everyday English word isn't another drug ("migrane" is 1
  // change from "migraine" and from the product "migraide").
  if (bestOther && closestEnglishChanges(word, bestOther.changes) <= bestOther.changes) {
    bestOther = null;
  }
  if (bestOther && (!bestOurs || bestOther.changes <= bestOurs.changes)) {
    return { kind: "other", name: bestOther.name, typedAs: typed };
  }
  if (bestOurs) return { kind: "ours", drug: OUR_DRUG_NAMES[bestOurs.name]!, typedAs: typed };
  return null;
}

/** English words grouped by length, for the closer-English rule. */
const ENGLISH_BY_LENGTH: ReadonlyMap<number, readonly string[]> = (() => {
  const byLength = new Map<number, string[]>();
  for (const word of ENGLISH_WORDS) {
    const list = byLength.get(word.length) ?? [];
    list.push(word);
    byLength.set(word.length, list);
  }
  return byLength;
})();

/**
 * The fewest changes from `typed` to an everyday English word, checking only up to
 * `limit` changes. Returns `limit + 1` when no English word is that close.
 */
function closestEnglishChanges(typed: string, limit: number): number {
  let best = limit + 1;
  for (let length = typed.length - limit; length <= typed.length + limit; length++) {
    for (const english of ENGLISH_BY_LENGTH.get(length) ?? []) {
      const changes = editDistance(typed, english);
      if (changes < best) {
        best = changes;
        if (best === 0) return 0;
      }
    }
  }
  return best;
}

/** The number of changes if `typed` is within `name`'s typo allowance, else null. */
function withinAllowance(typed: string, name: string): number | null {
  const allowed = allowedChanges(name);
  if (allowed === 0 || Math.abs(typed.length - name.length) > allowed) return null;
  const changes = editDistance(typed, name);
  return changes <= allowed ? changes : null;
}

/** The class phrases found in the question (exact words, plural "s" allowed at the end). */
function classPhrasesIn(questionWords: readonly string[]): string[] {
  const found: string[] = [];
  for (const phrase of DRUG_CLASS_PHRASES) {
    const parts = phrase.split(" ");
    for (let i = 0; i + parts.length <= questionWords.length; i++) {
      const matches = parts.every((part, k) => {
        const typed = withoutPossessive(questionWords[i + k]!);
        return typed === part || (k === parts.length - 1 && typed === `${part}s`);
      });
      if (matches) {
        found.push(phrase);
        break;
      }
    }
  }
  return found;
}

/**
 * The question's words with their capitals kept, so `typedAs` shows the word as typed
 * ("Reyvo"). Same steps as normalize() in match.ts, minus lowercasing.
 */
function wordsAsTyped(question: string, lowercase: readonly string[]): readonly string[] {
  const kept = question
    .replace(/’/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .replace(/(^|\s)'+/g, "$1")
    .replace(/'+(?=\s|$)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const asTyped = kept === "" ? [] : kept.split(" ");
  // If lowercasing changed a word's length (rare letters), fall back to lowercase.
  const linesUp =
    asTyped.length === lowercase.length &&
    asTyped.every((word, i) => word.toLowerCase() === lowercase[i]);
  return linesUp ? asTyped : lowercase;
}

/** Every drug named in the question, in the order they appear (class phrases last). */
export function findDrugs(question: string): DrugMention[] {
  const questionWords = words(question);
  const typedWords = wordsAsTyped(question, questionWords);
  const mentions: DrugMention[] = [];
  questionWords.forEach((word, i) => {
    const mention = matchDrugWord(word);
    if (!mention) return;
    mentions.push(mention.typedAs ? { ...mention, typedAs: typedWords[i]! } : mention);
  });
  for (const phrase of classPhrasesIn(questionWords)) {
    mentions.push({ kind: "other", name: phrase });
  }
  return mentions;
}

/** True if a word is a drug name, exactly or as a typo (used by the language check). */
export function isDrugNameWord(word: string): boolean {
  return matchDrugWord(word) !== null;
}
