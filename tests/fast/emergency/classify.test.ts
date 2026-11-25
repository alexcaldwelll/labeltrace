// T019: sorting a medical emergency match into a case (src/lib/emergency/classify.ts;
// FR-047, FR-050, contracts/emergency-rules.md section 4).
import { describe, expect, it } from "vitest";
import { classifyMedical } from "@/lib/emergency/classify";

describe("classifyMedical", () => {
  // Each question would otherwise be informational (drug name + "?"), so only the
  // happening-now word can make it happening_now.
  for (const word of ["i", "I'm", "im", "me", "my", "we", "now", "today", "having"]) {
    it(`happening-now word "${word}" → happening_now`, () => {
      expect(classifyMedical(`Does Reyvow cause chest pain for ${word}?`)).toBe("happening_now");
    });
  }

  it('happening-now words "right now" → happening_now', () => {
    expect(classifyMedical("Does Reyvow cause chest pain right now?")).toBe("happening_now");
  });

  it('"Is" does not count as "I"', () => {
    expect(classifyMedical("Is chest pain a side effect of Reyvow?")).toBe("informational");
  });

  it('"worst headache of my life" → happening_now', () => {
    expect(classifyMedical("Can Emgality cause the worst headache of my life?")).toBe(
      "happening_now",
    );
  });

  for (const drug of ["Emgality", "Reyvow", "galcanezumab", "lasmiditan"]) {
    it(`drug name "${drug}" → informational`, () => {
      expect(classifyMedical(`Does ${drug} cause chest pain?`)).toBe("informational");
    });
  }

  it('"Does Reyvo cause chest pain?" → unclear', () => {
    expect(classifyMedical("Does Reyvo cause chest pain?")).toBe("unclear");
  });

  it('"reyvow chest pain" → unclear', () => {
    expect(classifyMedical("reyvow chest pain")).toBe("unclear");
  });
});
