// T033: the personal-details scrubber (research R10, FR-020). Plain code, no AI.
//
// scrub(raw) masks emails, then phone numbers, then names, and returns ScrubbedText
// (src/lib/scrub/types.ts). It's step 3 of the question steps (src/lib/pipeline/ask.ts):
// after the emergency check and the basic checks, before the refusal rules and any AI.
// Blank and non-English questions stop at step 2, so they're never scrubbed.
//
// Emails go first so the "jane" in "jane@example.com" is already gone when names are
// checked. scrub() keeps everything in memory: it never logs or saves the text.
import { maskEmails } from "./email";
import { maskNames } from "./names";
import { maskPhones } from "./phone";
import type { ScrubbedText } from "./types";

/** Masks emails ([EMAIL]), phone numbers ([PHONE]), and names ([NAME]). */
export function scrub(raw: string): ScrubbedText {
  return maskNames(maskPhones(maskEmails(raw))) as ScrubbedText;
}
