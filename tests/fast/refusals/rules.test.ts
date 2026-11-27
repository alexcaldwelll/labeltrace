// T026: the refusal rules (src/lib/refusals/rules.ts; research R14; FR-001, FR-011,
// FR-012, FR-013, FR-019, FR-056). The examples were reviewed by the owner on
// 2026-11-26.
import { describe, expect, it } from "vitest";
import { applyRefusalRules, type RuleResult } from "@/lib/refusals/rules";

import { RULE_CASES } from "./rule-cases";

function check(cases: [string, RuleResult][]) {
  for (const [question, expected] of cases) {
    it(`${question} → ${expected.kind}`, () => {
      expect(applyRefusalRules(question)).toEqual(expected);
    });
  }
}

for (const group of RULE_CASES) {
  describe(group.title, () => {
    check(group.cases);
  });
}
