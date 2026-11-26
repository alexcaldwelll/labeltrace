// T012: the ScrubbedText type.
//
// ScrubbedText is question text that has gone through the personal-details
// scrubber (names, emails, and phone numbers masked). It is a "branded" type: in
// code it is still a string, but TypeScript won't let a plain string be used where
// ScrubbedText is needed. So raw text can't reach the AI, the log, or the server
// logger by mistake; the code won't compile.
//
// Only scrub() (src/lib/scrub/index.ts, T033) makes real ScrubbedText from a
// question. The one other way is appText() below, which takes only fixed sentences
// written by the app itself, never user text (owner's decision 3A, 2026-11-26).

declare const scrubbedBrand: unique symbol;

/** Question text that has been scrubbed. Plain strings can't pass as this type. */
export type ScrubbedText = string & { readonly [scrubbedBrand]: true };

/**
 * The fixed sentences the app itself may send to an AI in place of a question. Only
 * these exact sentences: no user text, and nothing built from user text.
 */
export const APP_TEXTS = ["Summarize the general dosing in this section."] as const;

/** One of APP_TEXTS. A plain `string` doesn't fit, so a variable can't be passed. */
export type AppText = (typeof APP_TEXTS)[number];

/**
 * Turns one of the app's own fixed sentences into ScrubbedText (it holds no personal
 * details, so there is nothing to scrub). TypeScript accepts only an AppText.
 */
export function appText(text: AppText): ScrubbedText {
  return text as ScrubbedText;
}
