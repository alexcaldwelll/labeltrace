// T078: the only server logger (research R18). Writes to Netlify's function logs
// (the server console). There is no outside error-reporting service.
//
// - Question text is accepted only as ScrubbedText, so raw text won't compile.
// - Blank and non-English questions use noQuestion(), which takes no question text at
//   all (FR-055).
// - Errors are logged by type and message only, never with the request body. Before
//   the message is written, the raw question is cut out of it (replaced with
//   [QUESTION]; owner's decision 2A, 2026-11-27), and the rest of the message is
//   scrubbed, so a name, email, or phone number in it is masked too. The raw question
//   is used only for that cut; it's never written.
//
// Lint bans `console` everywhere in src/ except this file (eslint.config.mjs).
import { scrub } from "@/lib/scrub";
import type { ScrubbedText } from "@/lib/scrub/types";

export const QUESTION_MASK = "[QUESTION]";

/** What info() may log: an event name and, optionally, the scrubbed question. */
export type InfoFields = { question?: ScrubbedText };

/** Options for error(). */
export type ErrorOptions = {
  /** The raw question, only so it can be cut out of the error message. Never logged. */
  removeFromMessage?: string;
};

/** The error's type: its name for an Error ("TypeError"), else what kind of value it is. */
function errorType(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/** The error's message, with the raw question cut out and the rest scrubbed. */
function safeMessage(error: unknown, options: ErrorOptions): string {
  // A thrown value that isn't an Error could be anything, even the request body.
  if (!(error instanceof Error)) return "";
  let message = error.message;
  const raw = options.removeFromMessage;
  if (raw !== undefined && raw !== "") message = message.split(raw).join(QUESTION_MASK);
  return scrub(message);
}

export const serverLog = {
  /** An event, with the scrubbed question if there is one. */
  info(event: string, fields: InfoFields = {}): void {
    const line: Record<string, string> = { level: "info", event };
    if (fields.question !== undefined) line.question = fields.question;
    console.info(JSON.stringify(line));
  },

  /** An event for a blank or non-English question. It takes no question text. */
  noQuestion(event: string, reason: "blank" | "non_english"): void {
    console.info(JSON.stringify({ level: "info", event, reason }));
  },

  /** An error, by type and message only. */
  error(event: string, error: unknown, options: ErrorOptions = {}): void {
    console.error(
      JSON.stringify({
        level: "error",
        event,
        error_type: errorType(error),
        message: safeMessage(error, options),
      }),
    );
  },
};
