// T031: masks phone numbers (research R10, FR-020). Plain code, no AI.
//
// A run of digits, alone or split by single spaces, dashes, or dots, with an optional
// "+" in front and an optional group in brackets, becomes [PHONE] when it has:
// - 10 to 15 digits in all: "555-123-4567", "(555) 123 4567", "+44 20 7946 0958",
//   "1-800-555-1234", "5551234567"; or
// - exactly 3 digits, a dash or dot, then 4 digits (a U.S. local number): "555-1234".
//
// Not masked: doses ("120 mg", "120mg", "2.5 mL", "1,000 units") and dates
// ("2026-11-26", "11/26/2026"): they have too few digits, or a comma or slash that
// isn't a phone separator.
//
// Known limit (docs/risk-review-notes.md): a 10-digit product code like "0002-1436-01"
// is masked too, because it looks like a phone number.

export const PHONE_MASK = "[PHONE]";

/**
 * A digit run that could be a phone number. It can't start right after a letter,
 * digit, dot, or comma, and can't end right before a letter or digit, so it never
 * starts or ends inside a longer number or word ("1,000", "120mg").
 */
const CANDIDATE =
  /(?<![\p{L}\p{N}.,])(?:\+ ?)?(?:\(\d{1,4}\) ?)?\d+(?:[ .-]\d+|[ .-]?\(\d+\)[ .-]?\d+)*(?![\p{L}\p{N}])/gu;

/** A U.S. local number: 3 digits, a dash or dot, then 4 digits. */
const LOCAL = /^\d{3}[.-]\d{4}$/;

/** True if a digit run should be masked as a phone number. */
export function isPhoneNumber(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, "").length;
  return (digits >= 10 && digits <= 15) || LOCAL.test(candidate);
}

/** Replaces every phone number with [PHONE]. */
export function maskPhones(text: string): string {
  return text.replace(CANDIDATE, (candidate) =>
    isPhoneNumber(candidate) ? PHONE_MASK : candidate,
  );
}
