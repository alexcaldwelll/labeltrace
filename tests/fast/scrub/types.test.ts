// T012: proves a plain string can't be used as ScrubbedText.
//
// The real proof is the "@ts-expect-error" lines. `npm run typecheck` fails if any
// of them stops being an error, which would mean plain strings can pass as
// ScrubbedText. The vitest test below only makes sure this file runs.
import { describe, expect, it } from "vitest";
import type { ScrubbedText } from "@/lib/scrub/types";

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
