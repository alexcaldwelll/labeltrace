// T012: the ScrubbedText type.
//
// ScrubbedText is question text that has gone through the personal-details
// scrubber (names, emails, and phone numbers masked). It is a "branded" type: in
// code it is still a string, but TypeScript won't let a plain string be used where
// ScrubbedText is needed. So raw text can't reach the AI, the log, or the server
// logger by mistake; the code won't compile.
//
// Only scrub() (src/lib/scrub/index.ts, T033) makes real ScrubbedText.

declare const scrubbedBrand: unique symbol;

/** Question text that has been scrubbed. Plain strings can't pass as this type. */
export type ScrubbedText = string & { readonly [scrubbedBrand]: true };
