// T012: proves a plain string can't be used as ScrubbedText.
//
// The real proof is the "@ts-expect-error" lines. `npm run typecheck` fails if any
// of them stops being an error, which would mean plain strings can pass as
// ScrubbedText. The vitest test below only makes sure this file runs.
import { describe, expect, it } from "vitest";
import { APP_TEXTS, appText, type ScrubbedText } from "@/lib/scrub/types";

function needsScrubbed(text: ScrubbedText): string {
  return text;
}

describe("ScrubbedText", () => {
  it("can't be made from a plain string", () => {
    const raw = "My name is Jane Doe";

    // @ts-expect-error A plain string isn't ScrubbedText.
    const scrubbed: ScrubbedText = raw;

    // @ts-expect-error A plain string can't be passed where ScrubbedText is needed.
    needsScrubbed(raw);

    // @ts-expect-error A string literal isn't ScrubbedText either.
    needsScrubbed("[NAME] has a question");

    // At run time it is still just a string.
    expect(typeof scrubbed).toBe("string");
  });
});

// Decision 3A (2026-11-26): appText() takes only the app's own fixed sentences.
describe("appText", () => {
  it("accepts only a fixed app sentence, never a variable string", () => {
    const fixed: ScrubbedText = appText("Summarize the general dosing in this section.");
    needsScrubbed(fixed);

    // These lines are only for the type check: they never run (appText would throw).
    const neverRun = () => {
      const variable: string = "Summarize the general dosing in this section.";
      // @ts-expect-error A variable string isn't an AppText, even with the same words.
      appText(variable);

      // @ts-expect-error A changed sentence isn't an AppText.
      appText("Summarize the dosing for a 200 pound adult.");

      // @ts-expect-error User text can't pass either.
      appText(`My name is Jane. ${APP_TEXTS[0]}`);
    };
    expect(typeof neverRun).toBe("function");

    expect(fixed).toBe(APP_TEXTS[0]);
  });

  it("also refuses other text at run time, if a type check is bypassed", () => {
    expect(() => appText("My name is Jane Doe" as never)).toThrow(/fixed sentences/);
  });
});
