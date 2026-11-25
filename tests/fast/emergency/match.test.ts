// T016: text matching with the typo allowance (src/lib/text/match.ts; FR-009,
// contracts/emergency-rules.md section 3).
import { describe, expect, it } from "vitest";
import { phraseMatches } from "@/lib/text/match";

describe("phrase matching", () => {
  it("capitals", () => {
    expect(phraseMatches("I HAVE CHEST PAIN", "chest pain")).toBe(true);
  });

  it("curly apostrophe", () => {
    expect(phraseMatches("I can’t breathe", "can't breathe")).toBe(true);
  });

  it("phrase inside a long sentence", () => {
    expect(
      phraseMatches(
        "Since this morning, after my second dose, I have had chest pain that comes and goes.",
        "chest pain",
      ),
    ).toBe(true);
  });

  it("a 3-letter word with one typo does not match", () => {
    expect(phraseMatches("I want to dye", "want to die")).toBe(false);
  });

  it("a 5-letter word off by 1 matches, off by 2 doesn't", () => {
    expect(phraseMatches("chets pain", "chest pain")).toBe(true); // two letters swapped
    expect(phraseMatches("chxsx pain", "chest pain")).toBe(false);
  });

  it("a 9-letter word off by 2 matches", () => {
    expect(phraseMatches("trouble brethng", "trouble breathing")).toBe(true); // 2 letters missing
  });

  describe("quote marks and punctuation around a phrase (contract section 3, step 1)", () => {
    const cases: [string, string][] = [
      ["I 'want to die'", "want to die"],
      ["I \u2018want to die\u2019", "want to die"],
      ['I "want to die"', "want to die"],
      ["she said 'end my life'", "end my life"],
      ["'suicide'", "suicide"],
      ["want to die!!!", "want to die"],
      ["want to die...", "want to die"],
      ["want to\ndie", "want to die"],
      ["want  to   die", "want to die"],
      ["(want to die)", "want to die"],
      ["*want to die*", "want to die"],
    ];
    for (const [text, phrase] of cases) {
      it(`${JSON.stringify(text)} matches "${phrase}"`, () => {
        expect(phraseMatches(text, phrase)).toBe(true);
      });
    }
  });
});
