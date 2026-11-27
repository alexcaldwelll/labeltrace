// T078: the only server logger (src/lib/log/server-log.ts; research R18), with the
// owner's decision 2A (2026-11-27): the raw question is cut out of error messages, and
// the rest of the message is scrubbed.
import { afterEach, describe, expect, it, vi } from "vitest";

import { QUESTION_MASK, serverLog } from "@/lib/log/server-log";
import { scrub } from "@/lib/scrub";

const QUESTION =
  "Hi, I'm Jane Doe, jane@example.com, 555-123-4567. Does Emgality cause injection site pain?";
const DETAILS = ["Jane", "Doe", "jane@example.com", "555-123-4567"];

/** True if `detail` appears as a whole word (so "Doe" doesn't match "Does"). */
function hasDetail(text: string, detail: string): boolean {
  const escaped = detail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(text);
}

/** Everything written to the console, as one string. */
function written(): string {
  const info = vi.mocked(console.info).mock.calls;
  const error = vi.mocked(console.error).mock.calls;
  return [...info, ...error].map((args) => args.join(" ")).join("\n");
}

function spyOnConsole() {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("question text", () => {
  it("accepts only ScrubbedText (type test)", () => {
    spyOnConsole();
    serverLog.info("asked", { question: scrub(QUESTION) });

    // These lines are only for the type check: they never run.
    const neverRun = () => {
      // @ts-expect-error A plain string can't be passed as the question.
      serverLog.info("asked", { question: QUESTION });
      // @ts-expect-error Blank and non-English calls take no question text.
      serverLog.noQuestion("asked", "blank", QUESTION);
    };
    expect(typeof neverRun).toBe("function");

    expect(written()).toContain("Hi, I'm [NAME], [EMAIL], [PHONE].");
  });

  it("blank and non-English calls write no question text", () => {
    spyOnConsole();
    serverLog.noQuestion("asked", "blank");
    serverLog.noQuestion("asked", "non_english");
    const lines = vi.mocked(console.info).mock.calls.map((args) => JSON.parse(String(args[0])));
    expect(lines).toEqual([
      { level: "info", event: "asked", reason: "blank" },
      { level: "info", event: "asked", reason: "non_english" },
    ]);
  });
});

describe("errors", () => {
  it("logs an error by type and message, with the raw question cut out", () => {
    spyOnConsole();
    serverLog.error("ask_failed", new TypeError(`Couldn't read: ${QUESTION}`), {
      removeFromMessage: QUESTION,
    });
    const line = JSON.parse(String(vi.mocked(console.error).mock.calls[0]![0]));
    expect(line).toEqual({
      level: "error",
      event: "ask_failed",
      error_type: "TypeError",
      message: `Couldn't read: ${QUESTION_MASK}`,
    });
    expect(written()).not.toContain(QUESTION);
  });

  // Owner-approved (2026-11-27, decision 2A): the question JSON-escaped, and only part
  // of it. Neither matches the raw question exactly, so scrubbing the message must
  // still mask every detail.
  it("an error with the question JSON-escaped shows no raw name, email, or phone", () => {
    spyOnConsole();
    const quoted = `Hi, I'm Jane Doe, "jane@example.com", 555-123-4567.\nDoes Emgality cause pain?`;
    serverLog.error("ask_failed", new Error(`Bad body: ${JSON.stringify({ question: quoted })}`), {
      removeFromMessage: quoted,
    });
    for (const detail of DETAILS) expect(hasDetail(written(), detail), detail).toBe(false);
  });

  it("an error with part of the question shows no raw name, email, or phone", () => {
    spyOnConsole();
    const part = QUESTION.slice(0, 55); // "Hi, I'm Jane Doe, jane@example.com, 555-123-4567. Does "
    serverLog.error("ask_failed", new Error(`Failed on: ${part}`), {
      removeFromMessage: QUESTION,
    });
    for (const detail of DETAILS) expect(hasDetail(written(), detail), detail).toBe(false);
  });
});
