// T028: the dosing number check (src/lib/checks/dosing-numbers.ts) and the word-for-word
// fallback (src/lib/refusals/respond.ts; spec PC-7).
import { describe, expect, it } from "vitest";
import { checkDosingNumbers } from "@/lib/checks/dosing-numbers";
import type { GetLabel } from "@/lib/emergency/respond";
import { ask } from "@/lib/pipeline/ask";
import { dosingLead } from "@/lib/refusals/respond";
import { FakeAnswerClient } from "../../helpers/fake-ai";

const SECTION_TEXT =
  "The recommended dose is 120 mg injected subcutaneously once monthly. Allow the pen to sit at room temperature for 30 minutes.";

const getLabel: GetLabel = async (drug) => ({
  found: true,
  label: {
    drug,
    labelId: "id",
    setId: "set",
    labelDate: "2026-06-05",
    sections: [
      {
        field_key: "dosage_and_administration",
        display_name: "Dosage and Administration",
        text: SECTION_TEXT,
      },
    ],
  },
});

const QUESTION = "How much Emgality should I take?";
const ai = (answer: string) =>
  new FakeAnswerClient({ answer, sectionsUsed: [], answerType: "normal" });

async function dosingReply(answerAI?: FakeAnswerClient) {
  return ask(QUESTION, answerAI ? { getLabel, answerAI } : { getLabel });
}

describe("the task's tests", () => {
  it("numbers that match the label → the AI summary is shown", async () => {
    const reply = await dosingReply(ai("You inject 120 mg once monthly."));
    expect(reply).toMatchObject({ dosing_source: "ai_summary" });
    expect(reply).toMatchObject({
      text: `${dosingLead("emgality")} You inject 120 mg once monthly.`,
    });
  });

  it("a wrong number (240 mg when the label says 120 mg) → word-for-word fallback", async () => {
    expect(await dosingReply(ai("You inject 240 mg once monthly."))).toMatchObject({
      dosing_source: "label_text",
    });
  });

  it("a wrong unit (mL vs mg) → fallback", async () => {
    expect(await dosingReply(ai("You inject 120 mL once monthly."))).toMatchObject({
      dosing_source: "label_text",
    });
  });

  it("a number not in the label at all → fallback", async () => {
    expect(await dosingReply(ai("Take 3 doses a day."))).toMatchObject({
      dosing_source: "label_text",
    });
  });

  it("AI down → fallback", async () => {
    const down = new FakeAnswerClient(() => {
      throw new Error("AI down");
    });
    expect(await dosingReply(down)).toMatchObject({ dosing_source: "label_text" });
  });

  it("the fallback text exactly equals the stored section text (after the fixed lead)", async () => {
    const reply = await dosingReply(ai("You inject 240 mg."));
    expect(reply).toMatchObject({ text: `${dosingLead("emgality")} ${SECTION_TEXT}` });
  });
});

// Owner-approved extra tests (2026-11-26, detail 4).
describe("checkDosingNumbers", () => {
  const passes = (summary: string, label = SECTION_TEXT) =>
    expect(checkDosingNumbers(summary, label).ok).toBe(true);
  const fails = (summary: string, label = SECTION_TEXT) =>
    expect(checkDosingNumbers(summary, label).ok).toBe(false);

  it("spacing doesn't matter: 120mg = 120 mg", () => passes("Inject 120mg once monthly."));
  it("capitals don't matter in units (decision 3B): 120 MG = 120 mg", () =>
    passes("Inject 120 MG once monthly."));

  const reyvow = "The recommended dose of REYVOW is 50 mg, 100 mg, or 200 mg taken orally.";
  it("a range that isn't in the label fails", () => fails("Take 50 to 200 mg.", reyvow));
  // Owner-approved 2026-11-26 (follow-up).
  it("a dash range that isn't in the label fails", () => fails("Take 50-200 mg.", reyvow));
  it("the doses written the label's way pass", () =>
    passes("Take 50 mg, 100 mg, or 200 mg.", reyvow));

  it('"2" isn\'t "two"', () => {
    const label = "administered as two consecutive injections of 120 mg each";
    fails("You get 2 injections of 120 mg.", label);
    passes("You get two consecutive injections of 120 mg each.", label);
  });

  it("a frequency word that isn't in the label fails", () => fails("Inject 120 mg daily."));
  // Owner-approved 2026-11-26 (follow-up).
  it('"once a month" fails when the label says "once monthly"', () =>
    fails("Inject 120 mg once a month."));
  it('"half a tablet" fails when it isn\'t in the label', () =>
    fails("Take half a tablet.", reyvow));
  it("a decimal number must match exactly", () => {
    passes("Take 2.5 mg.", "The dose is 2.5 mg.");
    fails("Take 2.5 mg.", "The dose is 25 mg.");
  });

  it("a bare number passes when it's in the label", () =>
    passes("Let it warm for 30 minutes first.", SECTION_TEXT));

  it("a section number like 2.1 passes when it's in the label", () =>
    passes("See section 2.1.", "2.1 Recommended Dosing for Migraine"));
});
