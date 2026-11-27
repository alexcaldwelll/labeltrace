// T032: masks people's names (research R10, R22; spec PC-9; FR-020). Plain code, no AI.
// Runs after emails and phone numbers are masked. "Mask when unsure" wins.
//
// Protected words are never masked by any layer (owner's decision 1A, 2026-11-27):
// - drug names: our 4 names, every name on the other-drug list, the class words, and
//   the "never on the list" words (all through T024's drug-names.ts);
// - near-miss typos of those drug names ("Reyvo", "Imitrx"; T016's typo rules), unless
//   the word is on the common first-name list (R22), which is always masked;
// - words in label section names ("Warnings and Precautions");
// - relationship words (RELATIONSHIP_WORDS: sister, doctor, grandma, ...), with "-s" or
//   "'s" (owner-approved 2026-11-27). When the name finder flags one together with a
//   name, only the name is masked: "My sister Maria" → "My sister [NAME]".
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
// A possessive "'s" stays visible after a masked name ("Dr. [NAME]'s advice"), and the
// letters inside the masks [EMAIL], [PHONE], [NAME] are never checked as names (owner-
// approved 2026-11-27).
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

/** Words for people in someone's life. Never masked (owner-approved list, 2026-11-27). */
export const RELATIONSHIP_WORDS: ReadonlySet<string> = new Set([
  // family
  "sister",
  "brother",
  "sibling",
  "wife",
  "husband",
  "spouse",
  "partner",
  "boyfriend",
  "girlfriend",
  "fiance",
  "fiancee",
  // parents
  "mom",
  "mum",
  "mommy",
  "mama",
  "mother",
  "dad",
  "daddy",
  "papa",
  "father",
  "parent",
  // children
  "son",
  "daughter",
  "child",
  "children",
  "kid",
  "baby",
  // grandparents and grandchildren
  "grandma",
  "grandmother",
  "grandpa",
  "grandfather",
  "granny",
  "grandson",
  "granddaughter",
  // wider family
  "aunt",
  "auntie",
  "uncle",
  "cousin",
  "niece",
  "nephew",
  // step-family
  "stepmom",
  "stepmother",
  "stepdad",
  "stepfather",
  "stepson",
  "stepdaughter",
  // other people
  "friend",
  "roommate",
  "neighbor",
  "coworker",
  "boss",
  // health workers
  "doctor",
  "nurse",
  "pharmacist",
  "neurologist",
  "dentist",
  "therapist",
]);

/** True for a relationship word, also with "-s" or "'s" ("sisters", "sister's"). */
function isRelationshipWord(lower: string): boolean {
  return (
    RELATIONSHIP_WORDS.has(lower) ||
    (lower.endsWith("s") && RELATIONSHIP_WORDS.has(lower.slice(0, -1)))
  );
}

const INTRO =
  /\b(?:i['’]m|i am|my name is|this is|thanks|thank you|thx|regards|best|cheers|sincerely)\b,?[ \t]+/giu;

/** Words: letters, with apostrophes inside ("I'm", "Smith's"). */
const WORD = /\p{L}[\p{L}'’]*/gu;

/** The masks scrubbing puts in. Their letters are never checked as names. */
const MASK_TOKEN = /\[(?:EMAIL|PHONE|NAME)\]/g;

type Span = { start: number; end: number };

/** "Smith's" → "Smith". */
function withoutPossessive(word: string): string {
  return word.replace(/['’]s$/u, "");
}

function isCapitalized(word: string): boolean {
  return /^\p{Lu}/u.test(word);
}

/** "I", "I'm", "I've", "I'd", "I'll": never names. */
function isI(word: string): boolean {
  return word === "I" || /^I['’]/u.test(word);
}

/** True if no layer may mask this word. */
function isProtected(word: string, firstNames: ReadonlySet<string>): boolean {
  const lower = withoutPossessive(word).toLowerCase();
  if (NEVER_OTHER_DRUG.has(lower) || SECTION_WORDS.has(lower)) return true;
  if (isRelationshipWord(lower)) return true;
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

/** The span of a word, without a possessive "'s" at the end. */
function wordSpan(start: number, word: string): Span {
  return { start, end: start + withoutPossessive(word).length };
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
      if (text.slice(start, start + word.length) === word) {
        words.push(wordSpan(start, word));
      } else {
        // The finder's position didn't line up with the text: mask the word
        // everywhere it appears (mask when unsure).
        for (const match of text.matchAll(WORD)) {
          if (match[0] === word) words.push(wordSpan(match.index, word));
        }
      }
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
    const lower = withoutPossessive(word).toLowerCase();
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
  const masks: Span[] = [...text.matchAll(MASK_TOKEN)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
  }));
  const insideMask = (span: Span) => masks.some((m) => span.start < m.end && span.end > m.start);
  const spans = [
    ...introSpans(text, firstNames),
    ...finderSpans(text, firstNames),
    ...capitalSpans(text, firstNames),
  ].filter((span) => span.end > span.start && !insideMask(span));
  let out = text;
  for (const span of joinSpans(text, spans).reverse()) {
    out = out.slice(0, span.start) + NAME_MASK + out.slice(span.end);
  }
  return out;
}
