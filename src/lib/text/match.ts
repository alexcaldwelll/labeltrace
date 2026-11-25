// T016: text matching with the typo allowance (FR-009, contracts/emergency-rules.md
// section 3). Plain code, no AI.
//
// 1. Normalize: lowercase, curly apostrophe (’) → straight ('), every other
//    character that isn't a letter, digit, apostrophe, or space → space, then squash
//    repeated spaces. Apostrophes at the start or end of a word are treated as
//    punctuation (removed), so a phrase in single quotes ('want to die') still
//    matches; apostrophes inside a word stay (can't, i'm, i've). (Owner's decision
//    2026-11-25, contract section 3.)
// 2. Split into words.
// 3. A phrase matches when its words appear next to each other, in order. Each typed
//    word may differ from the phrase's word by a few changes (an added, removed,
//    swapped, or wrong letter). How many depends on the PHRASE word's length,
//    counting letters only (owner's decision D1, 2026-11-25):
//      1–3 letters: exact only · 4–7 letters: at most 1 · 8 or more: at most 2.

/**
 * Lowercase, straighten apostrophes, turn other punctuation into spaces, remove
 * apostrophes at the start or end of a word, squash spaces.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .replace(/(^|\s)'+/g, "$1")
    .replace(/'+(?=\s|$)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The words of a text, after normalizing. */
export function words(text: string): string[] {
  const normalized = normalize(text);
  return normalized === "" ? [] : normalized.split(" ");
}

/**
 * The number of changes between two words: an added, removed, or wrong letter, or two
 * neighboring letters swapped (each counts as 1).
 */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) d[i]![0] = i;
  for (let j = 0; j < cols; j++) d[0]![j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        d[i - 1]![j]! + 1, // removed
        d[i]![j - 1]! + 1, // added
        d[i - 1]![j - 1]! + cost, // same or wrong letter
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, d[i - 2]![j - 2]! + 1); // two neighbors swapped
      }
      d[i]![j] = best;
    }
  }
  return d[a.length]![b.length]!;
}

/** How many changes a phrase word allows, by its number of letters. */
export function allowedChanges(phraseWord: string): number {
  const letters = (phraseWord.match(/\p{L}/gu) ?? []).length;
  if (letters <= 3) return 0;
  if (letters <= 7) return 1;
  return 2;
}

/** Does a typed word match a phrase word, within the phrase word's allowance? */
export function wordMatches(typed: string, phraseWord: string): boolean {
  return editDistance(typed, phraseWord) <= allowedChanges(phraseWord);
}

/** Does the phrase appear in the text: its words next to each other, in order? */
export function phraseMatches(text: string, phrase: string): boolean {
  const textWords = words(text);
  const phraseWords = words(phrase);
  if (phraseWords.length === 0) return false;
  for (let start = 0; start + phraseWords.length <= textWords.length; start++) {
    if (phraseWords.every((word, k) => wordMatches(textWords[start + k]!, word))) return true;
  }
  return false;
}
