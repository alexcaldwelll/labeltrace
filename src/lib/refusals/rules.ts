// T026: the refusal rules (research R14; FR-001, FR-011, FR-012, FR-013, FR-019,
// FR-056). Plain code, no AI.
//
// Checked top to bottom; the first match wins:
// 1. Comparison: two DIFFERENT drugs are named (a brand and its generic count as one;
//    a class word like "triptan" counts as a drug) plus comparison phrasing.
// 2. Other drug: any drug that isn't ours is named.
// 3. Which drug: neither of our drugs is named.
// 4. Personal dosing (triggers below). With both of our drugs named, the reply asks
//    which drug instead (owner's decision 4A, 2026-11-26).
// 5. Otherwise: not refused. The question goes on as emgality, reyvow, or both, with
//    the misspelled word for each drug matched by a typo (`typedAs`).
//
// Drug names allow typos (drug-names.ts). Every other trigger word must be exact,
// ignoring capitals, punctuation, and "'s" (owner's decision 2026-11-26: typos only
// added false alarms, like "make another" and "same for me").
import type { Drug } from "@/lib/labels/store";
import { words } from "@/lib/text/match";
import { findDrugs, type DrugMention } from "./drug-names";

export type RuleResult =
  | { kind: "comparison" }
  | { kind: "other_drug" }
  | { kind: "ask_which_drug" }
  | { kind: "personal_dosing"; drug: Drug; typedAs?: string }
  | { kind: "pass"; drug: Drug | "both"; typedAs: Partial<Record<Drug, string>> };

/** Comparison words that count with two drug names. */
const COMPARISON_PHRASES = [["better", "than"], ["vs"], ["compared", "to"], ["instead", "of"]];

/** Words that make "or" count as comparison phrasing. */
const OR_COMPARISON_WORDS = new Set([
  "which",
  "better",
  "best",
  "worse",
  "stronger",
  "safer",
  "choose",
]);

/**
 * Personal-dosing triggers that always count. `gap` is how many words may sit between
 * the two parts ("How much Emgality should I take").
 */
const DOSING_TRIGGERS: { parts: string[][]; gap?: number; notBeforeTimeWord?: true }[] = [
  {
    parts: [
      ["how", "much"],
      ["should", "i"],
    ],
    gap: 4,
  },
  {
    parts: [
      ["how", "many"],
      ["should", "i"],
    ],
    gap: 4,
  },
  { parts: [["i", "weigh"]] },
  { parts: [["for", "my", "age"]] },
  { parts: [["take", "another"]] },
  { parts: [["a", "second", "dose"]] },
  // "Does it take two weeks to work?" asks how long it takes, not how much to take.
  { parts: [["take", "two"]], notBeforeTimeWord: true },
  { parts: [["take", "2"]], notBeforeTimeWord: true },
  { parts: [["double", "my", "dose"]] },
];

/** Personal-dosing triggers that count only when the question also has a dose word. */
const DOSING_TRIGGERS_WITH_DOSE_WORD: string[][] = [
  ["my", "weight"],
  ["safe", "for", "me"],
  ["my", "son"],
  ["my", "daughter"],
  ["my", "child"],
  ["my", "kid"],
  ["my", "kids"],
  ["my", "children"],
];

const DOSE_WORDS = new Set([
  "dose",
  "doses",
  "dosing",
  "dosage",
  "mg",
  "tablet",
  "tablets",
  "pill",
  "pills",
  "injection",
  "injections",
  "shot",
  "shots",
]);
const DOSE_PHRASES = [
  ["how", "much"],
  ["how", "many"],
];

const TIME_WORDS = new Set([
  "minute",
  "minutes",
  "hour",
  "hours",
  "day",
  "days",
  "week",
  "weeks",
  "month",
  "months",
  "year",
  "years",
]);

/** True if `parts` appears at position `at`. */
function sequenceAt(questionWords: readonly string[], at: number, parts: readonly string[]) {
  return parts.every((part, k) => questionWords[at + k] === part);
}

/** Every position where `parts` starts. */
function positionsOf(questionWords: readonly string[], parts: readonly string[]): number[] {
  const found: number[] = [];
  for (let i = 0; i + parts.length <= questionWords.length; i++) {
    if (sequenceAt(questionWords, i, parts)) found.push(i);
  }
  return found;
}

function has(questionWords: readonly string[], parts: readonly string[]): boolean {
  return positionsOf(questionWords, parts).length > 0;
}

/** The question's words, lowercase, with "'s" removed ("son's" → "son"). */
function ruleWords(question: string): string[] {
  return words(question).map((word) => (word.endsWith("'s") ? word.slice(0, -2) : word));
}

export function isComparisonPhrasing(questionWords: readonly string[]): boolean {
  if (COMPARISON_PHRASES.some((phrase) => has(questionWords, phrase))) return true;
  const orAt = questionWords.indexOf("or");
  if (orAt === -1) return false;
  if (questionWords.some((word) => OR_COMPARISON_WORDS.has(word))) return true;
  // "should I take … or …" / "should I use … or …"
  for (const verb of ["take", "use"]) {
    if (positionsOf(questionWords, ["should", "i", verb]).some((at) => at < orAt)) return true;
  }
  return false;
}

export function isPersonalDosing(questionWords: readonly string[]): boolean {
  for (const trigger of DOSING_TRIGGERS) {
    const [first, second] = trigger.parts;
    for (const at of positionsOf(questionWords, first!)) {
      const after = at + first!.length;
      if (!second) {
        if (trigger.notBeforeTimeWord && TIME_WORDS.has(questionWords[after] ?? "")) continue;
        return true;
      }
      for (let gap = 0; gap <= (trigger.gap ?? 0); gap++) {
        if (sequenceAt(questionWords, after + gap, second)) return true;
      }
    }
  }
  const hasDoseWord =
    questionWords.some((word) => DOSE_WORDS.has(word) || /^\d+(?:\.\d+)?mg$/.test(word)) ||
    DOSE_PHRASES.some((phrase) => has(questionWords, phrase));
  return hasDoseWord && DOSING_TRIGGERS_WITH_DOSE_WORD.some((t) => has(questionWords, t));
}

/** The distinct drugs named: our brands, and each other drug's name. */
function distinctDrugs(mentions: readonly DrugMention[]): Set<string> {
  return new Set(mentions.map((m) => (m.kind === "ours" ? `ours:${m.drug}` : `other:${m.name}`)));
}

/** Applies the refusal rules to a question. */
export function applyRefusalRules(question: string): RuleResult {
  const questionWords = ruleWords(question);
  const mentions = findDrugs(question);

  if (distinctDrugs(mentions).size >= 2 && isComparisonPhrasing(questionWords)) {
    return { kind: "comparison" };
  }
  if (mentions.some((m) => m.kind === "other")) return { kind: "other_drug" };

  const typedAs: Partial<Record<Drug, string>> = {};
  const ours = new Set<Drug>();
  // Exact matches first, so an exact name always wins over a typo of the same drug.
  for (const mention of mentions)
    if (mention.kind === "ours" && !mention.typedAs) ours.add(mention.drug);
  for (const mention of mentions) {
    if (mention.kind !== "ours" || !mention.typedAs) continue;
    if (!ours.has(mention.drug)) typedAs[mention.drug] ??= mention.typedAs;
  }
  for (const mention of mentions) if (mention.kind === "ours") ours.add(mention.drug);
  if (ours.size === 0) return { kind: "ask_which_drug" };

  const drugs = (["emgality", "reyvow"] as const).filter((drug) => ours.has(drug));
  if (isPersonalDosing(questionWords)) {
    if (drugs.length > 1) return { kind: "ask_which_drug" };
    const drug = drugs[0]!;
    return typedAs[drug]
      ? { kind: "personal_dosing", drug, typedAs: typedAs[drug] }
      : { kind: "personal_dosing", drug };
  }
  return { kind: "pass", drug: drugs.length > 1 ? "both" : drugs[0]!, typedAs };
}
