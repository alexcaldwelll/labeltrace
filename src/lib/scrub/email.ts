// T031: masks email addresses (research R10, FR-020). Plain code, no AI.
//
// Anything shaped like name@place.ending becomes [EMAIL]: "jane@example.com",
// "j.doe+mig@mail.co.uk". Emails are masked before phone numbers and names, so the
// "jane" inside an email is already gone when names are checked.

export const EMAIL_MASK = "[EMAIL]";

/** The part before "@", the "@", then one or more dotted parts ending in 2+ letters. */
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu;

/** Replaces every email address with [EMAIL]. */
export function maskEmails(text: string): string {
  return text.replace(EMAIL, EMAIL_MASK);
}
