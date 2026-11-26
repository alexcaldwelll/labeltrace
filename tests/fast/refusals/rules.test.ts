// T026: the refusal rules (src/lib/refusals/rules.ts; research R14; FR-001, FR-011,
// FR-012, FR-013, FR-019, FR-056). The examples were reviewed by the owner on
// 2026-11-26.
import { describe, expect, it } from "vitest";
import { applyRefusalRules, type RuleResult } from "@/lib/refusals/rules";

function check(cases: [string, RuleResult][]) {
  for (const [question, expected] of cases) {
    it(`${question} → ${expected.kind}`, () => {
      expect(applyRefusalRules(question)).toEqual(expected);
    });
  }
}

const COMPARISON: RuleResult = { kind: "comparison" };
const OTHER: RuleResult = { kind: "other_drug" };
const WHICH: RuleResult = { kind: "ask_which_drug" };
const dosing = (drug: "emgality" | "reyvow", typedAs?: string): RuleResult =>
  typedAs ? { kind: "personal_dosing", drug, typedAs } : { kind: "personal_dosing", drug };
const pass = (
  drug: "emgality" | "reyvow" | "both",
  typedAs: Partial<Record<"emgality" | "reyvow", string>> = {},
): RuleResult => ({ kind: "pass", drug, typedAs });

describe("US2 scenarios 1–3 (spec's questions)", () => {
  check([
    ["How much Emgality should I take? I weigh 200 pounds", dosing("emgality")],
    ["Is Reyvow better than Emgality?", COMPARISON],
    ["Is Reyvow better than Imitrex?", COMPARISON],
    ["What are the side effects of Ubrelvy?", OTHER],
  ]);
});

describe("the task's tests", () => {
  check([
    ["Does it cause nausea?", WHICH],
    ["How are Emgality and Reyvow given?", pass("both")],
    ["How are Emgality or Reyvow given?", pass("both")],
    ["Which is better, Emgality or Reyvow?", COMPARISON],
    ["Should I take Emgality or Reyvow?", COMPARISON],
    ["Is Imitrx safe?", OTHER],
    ["Is Reyvow better than Imitrx?", COMPARISON],
    ["Does Reyvo cause nausea?", pass("reyvow", { reyvow: "Reyvo" })],
    ["Does lasmiditen cause nausea?", pass("reyvow", { reyvow: "lasmiditen" })],
    ["Does Reyvow cause nausea?", pass("reyvow")],
  ]);
});

describe("examples that should be refused (owner-reviewed)", () => {
  check([
    ["Can I take Reyvow with Imitrex?", OTHER],
    ["How much should I take?", WHICH],
  ]);
});

describe("examples that should NOT be refused (owner-reviewed)", () => {
  check([
    ["What is the usual dose of Emgality?", pass("emgality")],
    ["What's the best time to take Reyvow?", pass("reyvow")],
    ["Can I drink alcohol with Reyvow?", pass("reyvow")],
    ["Is my headache from Reyvow?", pass("reyvow")],
  ]);
});

describe("drug-class words count as other drugs (owner's decision 2026-11-26)", () => {
  check([
    ["Can I take Reyvow with an SSRI?", OTHER],
    ["Can I take Emgality with beta blockers?", OTHER],
    ["Can I take Reyvow with NSAIDs?", OTHER],
    ["Is Reyvow better than a triptan?", COMPARISON],
    // Never on the list
    ["Is Emgality a CGRP antagonist?", pass("emgality")],
    ["Is Emgality an antibody?", pass("emgality")],
    // "sedation" is an English word, so it isn't a typo of "sedative" (decision 2A).
    ["Does Reyvow cause sedation?", pass("reyvow")],
  ]);
});

describe("known class-word false alarms (recorded on purpose)", () => {
  check([
    ["Is Reyvow a triptan?", OTHER],
    ["Is Reyvow a steroid?", OTHER],
  ]);
});

describe("personal-dosing triggers (owner-approved 2026-11-26)", () => {
  check([
    ["How many Reyvow tablets should I take in a day?", dosing("reyvow")],
    ["Can I take another Reyvow if my headache comes back?", dosing("reyvow")],
    ["Is a second dose of Reyvow ok within 24 hours?", dosing("reyvow")],
    ["Can I take two Reyvow tablets at once?", dosing("reyvow")],
    ["Should I double my dose of Emgality if I miss one?", dosing("emgality")],
    ["How much Reyvow can my son take?", dosing("reyvow")],
  ]);
});

describe("dosing triggers that don't count (owner-approved 2026-11-26)", () => {
  check([
    // "take two/2" before a time word asks how long it takes to work.
    ["Does Emgality take two weeks to start working?", pass("emgality")],
    ["Does Reyvow take 2 hours to work?", pass("reyvow")],
    // "safe for me", child words, and "my weight" (option A) need a dose word.
    ["Is Reyvow safe for me during pregnancy?", pass("reyvow")],
    ["Is Emgality safe for me if I have heart disease?", pass("emgality")],
    ["Is it safe for me to drive after Reyvow?", pass("reyvow")],
    ["Can my son take Emgality?", pass("emgality")],
    ["Can my child use Emgality?", pass("emgality")],
    ["Will Reyvow change my weight?", pass("reyvow")],
    // Trigger words must be exact (typos only added false alarms).
    ["Can I make another appointment after starting Emgality?", pass("emgality")],
    ["Is the dose the same for me as for others with Emgality?", pass("emgality")],
  ]);
});

describe("known dosing false alarms (recorded on purpose)", () => {
  check([
    ["How many days should I wait before calling my doctor about Reyvow?", dosing("reyvow")],
    ["Is a second dose needed when starting Emgality?", dosing("emgality")],
    ["How much should I worry about dizziness with Reyvow?", dosing("reyvow")],
  ]);
});

describe("closer-English rule: common misspellings are NOT refused (owner's decision 2026-11-26)", () => {
  check([
    ["Is Emgality ok for my migrane?", pass("emgality")],
    ["Does Reyvow help a migrain?", pass("reyvow")],
    ["Does Emgality cause a headach?", pass("emgality")],
    ["Does Reyvow help a headake?", pass("reyvow")],
    ["Does Emgality cause nausia?", pass("emgality")],
    ["Does Reyvow cause dizzyness?", pass("reyvow")],
    ["Is Emgality a medecine?", pass("emgality")],
    ["Do I need a perscription for Reyvow?", pass("reyvow")],
  ]);
});

describe("closer-English rule: known slip (recorded on purpose)", () => {
  // "Botx" is 1 change from Botox, but also 1 change from the English word "box", so it
  // counts as English and isn't refused. Misspelled drug names near English words rely
  // on the AI backstop (research R14 layer 2; docs/risk-review-notes.md).
  check([["Does Emgality interact with Botx?", pass("emgality")]]);
});
