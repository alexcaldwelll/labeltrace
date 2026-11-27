// T077: the refusal rules run on SCRUBBED text (step 3 comes before step 4), so every
// refusal-rule question must get the same result after scrub(). Drug names are
// protected words, so "Imitrex" and "Ubrelvy" still reach the rules.
import { describe, expect, it } from "vitest";

import { findDrugs } from "@/lib/refusals/drug-names";
import { applyRefusalRules } from "@/lib/refusals/rules";
import { scrub } from "@/lib/scrub";

import { COMPARISON, OTHER, pass, RULE_CASES } from "./rule-cases";

for (const group of RULE_CASES) {
  describe(`after scrub: ${group.title}`, () => {
    for (const [question, expected] of group.cases) {
      it(`${question} → ${expected.kind}`, () => {
        expect(applyRefusalRules(scrub(question))).toEqual(expected);
      });
    }
  });
}

describe("the task's questions, with a made-up name and phone number added", () => {
  it.each([
    ["Is Reyvow better than Imitrex?", COMPARISON],
    ["What are the side effects of Ubrelvy?", OTHER],
    ["Hi, I'm Jane Doe, 555-123-4567. Is Reyvow better than Imitrex?", COMPARISON],
    ["Hi, I'm Jane Doe, 555-123-4567. What are the side effects of Ubrelvy?", OTHER],
  ] as const)("%j", (question, expected) => {
    expect(applyRefusalRules(scrub(question))).toEqual(expected);
  });
});

describe("the masks never trigger a refusal or a drug match", () => {
  it("[NAME], [EMAIL], [PHONE] aren't drug names", () => {
    expect(findDrugs("[NAME] [EMAIL] [PHONE]")).toEqual([]);
    expect(applyRefusalRules("[NAME] [EMAIL] [PHONE] Does Reyvow cause nausea?")).toEqual(
      pass("reyvow"),
    );
  });
});
