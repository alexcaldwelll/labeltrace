// T032: masks people's names (research R10, R22; spec PC-9; FR-020). Plain code, no AI.
// Runs after emails and phone numbers are masked. "Mask when unsure" wins.
//
// Protected words are never masked by any layer (owner's decision 1A, 2026-11-27):
// - drug names: our 4 names, every name on the other-drug list, the class words, and
//   the "never on the list" words (all through T024's drug-names.ts);
// - near-miss typos of those drug names ("Reyvo", "Imitrx"; T016's typo rules), unless
//   the word is on the common first-name list (R22), which is always masked;
// - words in label section names ("Warnings and Precautions").
// Everyday English words are NOT protected. They only stop layer 3.
//
// The three layers. Each run of name words becomes one [NAME] ("Jane Doe" → [NAME]):
// 1. Intro phrases: "I'm", "I am", "my name is", "this is", and the sign-offs "thanks",
//    "thank you", "thx", "regards", "best", "cheers", "sincerely" (a comma after is
//    optional). The next word is masked if it starts with a capital letter and isn't
//    protected, and so is each capitalized word right after it (the last name)
//    (owner's decision 3A: "I'm pregnant" stays; this layer doesn't mask "i'm jane",
//    though the name finder sometimes does).
// 2. The `compromise` name finder. Titles in front (Dr., Mr., Mrs., Ms.) stay visible.
//    Guard: a single English word it flags at the start of a sentence is left alone
//    ("Will Emgality make me tired?").
// 3. The capital-letter rule: a capitalized word that isn't at the start of a sentence
//    and isn't protected is masked if it isn't an everyday English word, or if it is
//    on the common first-name list (owner's decision 2A: "Grace", "Will", and also
//    "in May"). "I", "I'm", "I've" are never names.
//
// "Start of a sentence": the start of the text, or right after ".", "!", "?", or a new
// line (not the "." of a title like "Dr.").
import nlp from "compromise";

import { SECTION_NAMES } from "@/lib/labels/sections";
import englishWords from "@/lib/pipeline/english-words.json";
import { matchDrugWord, NEVER_OTHER_DRUG } from "@/lib/refusals/drug-names";

import firstNamesFile from "./common-first-names.json";

export const NAME_MASK = "[NAME]";

const ENGLISH_WORDS: ReadonlySet<string> = new Set(englishWords.words);

/** The common first-name list (R22), lowercase. */
export const COMMON_FIRST_NAMES: ReadonlySet<string> = new Set(firstNamesFile.names);

/** Words in label section names, lowercase, without the small joining words. */
const SECTION_WORDS: ReadonlySet<string> = new Set(
  Object.values(SECTION_NAMES)
    .flatMap((name) => name.toLowerCase().match(/\p{L}+/gu) ?? [])
    .filter((word) => !["and", "of", "in", "for", "the"].includes(word)),
);

const TITLES: ReadonlySet<string> = new Set(["dr", "mr", "mrs", "ms"]);

const INTRO =
  /\b(?:i['’]m|i am|my name is|this is|thanks|thank you|thx|regards|best|cheers|sincerely)\b,?[ \t]+/giu;

/** Words: letters, with apostrophes inside ("I'm", "Smith's"). */
const WORD = /\p{L}[\p{L}'’]*/gu;

type Span = { start: number; end: number };

function isCapitalized(word: string): boolean {
  return /^\p{Lu}/u.test(word);
}

/** "I", "I'm", "I've", "I'd", "I'll": never names. */
function isI(word: string): boolean {
  return word === "I" || /^I['’]/u.test(word);
}

/** True if no layer may mask this word. */
function isProtected(word: string, firstNames: ReadonlySet<string>): boolean {
  const lower = word.toLowerCase();
  if (NEVER_OTHER_DRUG.has(lower) || SECTION_WORDS.has(lower)) return true;
  const drug = matchDrugWord(lower);
  if (drug === null) return false;
  // A near-miss typo of a drug name stays visible, unless it's a common first name.
  return drug.typedAs === undefined || !firstNames.has(lower);
}

/** True if the word starting at `index` is at the start of a sentence. */
export function isSentenceStart(text: string, index: number): boolean {
  const before = text.slice(0, index);
  const gap = /[\s"'“‘(\[]*$/u.exec(before)![0];
  if (gap.includes("\n")) return true;
  const rest = before.slice(0, before.length - gap.length);
  if (rest === "") return true;
  const last = rest[rest.length - 1]!;
  if (last === "!" || last === "?") return true;
  if (last !== ".") return false;
  // The "." of a title ("Dr. Smith") doesn't end a sentence.
  const wordBefore = /(\p{L}+)\.$/u.exec(rest)?.[1]?.toLowerCase();
  return wordBefore === undefined || !TITLES.has(wordBefore);
}

/** The span of a word. */
function wordSpan(start: number, word: string): Span {
  return { start, end: start + word.length };
}

/** Layer 1: names after intro phrases. */
function introSpans(text: string, firstNames: ReadonlySet<string>): Span[] {
  const spans: Span[] = [];
  for (const intro of text.matchAll(INTRO)) {
    let at = intro.index + intro[0].length;
    for (;;) {
      const next = /^\p{L}[\p{L}'’]*/u.exec(text.slice(at));
      if (!next || !isCapitalized(next[0]) || isI(next[0])) break;
      if (isProtected(next[0], firstNames)) break;
      spans.push(wordSpan(at, next[0]));
      at += next[0].length;
      // Only a single space joins the next part of the name.
      if (text[at] !== " ") break;
      at += 1;
    }
  }
  return spans;
}

type FoundTerm = { text: string; offset: { start: number; length: number } };
type FoundPerson = { terms: FoundTerm[] };

/** Layer 2: names the `compromise` name finder flags. */
function finderSpans(text: string, firstNames: ReadonlySet<string>): Span[] {
  const people = nlp(text)
    .people()
    .json({ offset: true, terms: { offset: true } }) as FoundPerson[];
  const spans: Span[] = [];
  for (const person of people) {
    const words: Span[] = [];
    for (const term of person.terms) {
      const word = /\p{L}[\p{L}'’]*/u.exec(term.text)?.[0];
      if (!word || TITLES.has(word.toLowerCase()) || isI(word)) continue;
      if (isProtected(word, firstNames)) continue;
      const start = term.offset.start + term.text.indexOf(word);
      words.push(wordSpan(start, word));
    }
    // Guard: one English word at the start of a sentence is left alone.
    if (words.length === 1) {
      const only = words[0]!;
      const word = text.slice(only.start, only.end);
      if (isSentenceStart(text, only.start) && ENGLISH_WORDS.has(word.toLowerCase())) continue;
    }
    spans.push(...words);
  }
  return spans;
}

/** Layer 3: capitalized words that aren't at the start of a sentence. */
function capitalSpans(text: string, firstNames: ReadonlySet<string>): Span[] {
  const spans: Span[] = [];
  for (const match of text.matchAll(WORD)) {
    const word = match[0];
    if (!isCapitalized(word) || isI(word) || isSentenceStart(text, match.index)) continue;
    if (isProtected(word, firstNames)) continue;
    const lower = word.toLowerCase();
    if (!ENGLISH_WORDS.has(lower) || firstNames.has(lower)) {
      spans.push(wordSpan(match.index, word));
    }
  }
  return spans;
}

/** Joins spans that overlap or are separated only by spaces. */
function joinSpans(text: string, spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const joined: Span[] = [];
  for (const span of sorted) {
    const last = joined[joined.length - 1];
    if (last && (span.start <= last.end || /^ +$/.test(text.slice(last.end, span.start)))) {
      last.end = Math.max(last.end, span.end);
    } else {
      joined.push({ ...span });
    }
  }
  return joined;
}

/**
 * Replaces people's names with [NAME]. `firstNames` is the common first-name list; a
 * test may pass a small made-up list instead.
 */
export function maskNames(
  text: string,
  firstNames: ReadonlySet<string> = COMMON_FIRST_NAMES,
): string {
  const spans = [
    ...introSpans(text, firstNames),
    ...finderSpans(text, firstNames),
    ...capitalSpans(text, firstNames),
  ].filter((span) => span.end > span.start);
  let out = text;
  for (const span of joinSpans(text, spans).reverse()) {
    out = out.slice(0, span.start) + NAME_MASK + out.slice(span.end);
  }
  return out;
}
