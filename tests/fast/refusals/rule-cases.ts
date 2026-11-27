// The refusal-rule test questions (T026), owner-reviewed 2026-11-26. Shared by
// rules.test.ts and rules-after-scrub.test.ts (T077), so both use the same questions.
import type { RuleResult } from "@/lib/refusals/rules";

export const COMPARISON: RuleResult = { kind: "comparison" };
export const OTHER: RuleResult = { kind: "other_drug" };
export const WHICH: RuleResult = { kind: "ask_which_drug" };
export const dosing = (drug: "emgality" | "reyvow", typedAs?: string): RuleResult =>
  typedAs ? { kind: "personal_dosing", drug, typedAs } : { kind: "personal_dosing", drug };
export const pass = (
  drug: "emgality" | "reyvow" | "both",
  typedAs: Partial<Record<"emgality" | "reyvow", string>> = {},
): RuleResult => ({ kind: "pass", drug, typedAs });

export type RuleCaseGroup = { title: string; cases: [string, RuleResult][] };

export const RULE_CASES: RuleCaseGroup[] = [
  {
    title: "US2 scenarios 1–3 (spec's questions)",
    cases: [
      ["How much Emgality should I take? I weigh 200 pounds", dosing("emgality")],
      ["Is Reyvow better than Emgality?", COMPARISON],
      ["Is Reyvow better than Imitrex?", COMPARISON],
      ["What are the side effects of Ubrelvy?", OTHER],
    ],
  },

  {
    title: "the task's tests",
    cases: [
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
    ],
  },

  {
    title: "examples that should be refused (owner-reviewed)",
    cases: [
      ["Can I take Reyvow with Imitrex?", OTHER],
      ["How much should I take?", WHICH],
    ],
  },

  {
    title: "examples that should NOT be refused (owner-reviewed)",
    cases: [
      ["What is the usual dose of Emgality?", pass("emgality")],
      ["What's the best time to take Reyvow?", pass("reyvow")],
      ["Can I drink alcohol with Reyvow?", pass("reyvow")],
      ["Is my headache from Reyvow?", pass("reyvow")],
    ],
  },

  {
    title: "drug-class words count as other drugs (owner's decision 2026-11-26)",
    cases: [
      ["Can I take Reyvow with an SSRI?", OTHER],
      ["Can I take Emgality with beta blockers?", OTHER],
      ["Can I take Reyvow with NSAIDs?", OTHER],
      ["Is Reyvow better than a triptan?", COMPARISON],
      // Never on the list
      ["Is Emgality a CGRP antagonist?", pass("emgality")],
      ["Is Emgality an antibody?", pass("emgality")],
      // "sedation" is an English word, so it isn't a typo of "sedative" (decision 2A).
      ["Does Reyvow cause sedation?", pass("reyvow")],
    ],
  },

  {
    title: "known class-word false alarms (recorded on purpose)",
    cases: [
      ["Is Reyvow a triptan?", OTHER],
      ["Is Reyvow a steroid?", OTHER],
    ],
  },

  {
    title: "personal-dosing triggers (owner-approved 2026-11-26)",
    cases: [
      ["How many Reyvow tablets should I take in a day?", dosing("reyvow")],
      ["Can I take another Reyvow if my headache comes back?", dosing("reyvow")],
      ["Is a second dose of Reyvow ok within 24 hours?", dosing("reyvow")],
      ["Can I take two Reyvow tablets at once?", dosing("reyvow")],
      ["Should I double my dose of Emgality if I miss one?", dosing("emgality")],
      ["How much Reyvow can my son take?", dosing("reyvow")],
    ],
  },

  {
    title: "dosing triggers that don't count (owner-approved 2026-11-26)",
    cases: [
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
    ],
  },

  {
    title: "known dosing false alarms (recorded on purpose)",
    cases: [
      ["How many days should I wait before calling my doctor about Reyvow?", dosing("reyvow")],
      ["Is a second dose needed when starting Emgality?", dosing("emgality")],
      ["How much should I worry about dizziness with Reyvow?", dosing("reyvow")],
    ],
  },

  {
    title: "closer-English rule: common misspellings are NOT refused (owner's decision 2026-11-26)",
    cases: [
      ["Is Emgality ok for my migrane?", pass("emgality")],
      ["Does Reyvow help a migrain?", pass("reyvow")],
      ["Does Emgality cause a headach?", pass("emgality")],
      ["Does Reyvow help a headake?", pass("reyvow")],
      ["Does Emgality cause nausia?", pass("emgality")],
      ["Does Reyvow cause dizzyness?", pass("reyvow")],
      ["Is Emgality a medecine?", pass("emgality")],
      ["Do I need a perscription for Reyvow?", pass("reyvow")],
    ],
  },

  {
    title: "closer-English rule: known slip (recorded on purpose)",
    // "Botx" is 1 change from Botox, but also 1 change from the English word "box", so it
    // counts as English and isn't refused. Misspelled drug names near English words rely
    // on the AI backstop (research R14 layer 2; docs/risk-review-notes.md).
    cases: [["Does Emgality interact with Botx?", pass("emgality")]],
  },

  // Owner-approved test (2026-11-26, item 6).
  {
    title: "personal dosing with both drugs named → which drug (decision 4A)",
    cases: [["How much Emgality and Reyvow should I take?", WHICH]],
  },

  // Owner-approved (2026-11-26, detail 6): a number joined to "mg" counts as a dose word.
  {
    title: "'100mg' counts as a dose word",
    cases: [["Is 100mg of Reyvow safe for me?", dosing("reyvow")]],
  },
];
