// T022: the emergency check is step 1 of every question (src/lib/pipeline/ask.ts;
// FR-004, FR-008, SC-013). A match returns the emergency reply right away, and the
// answer AI is never called.
import { describe, expect, it } from "vitest";
import { EMERGENCY_PHRASES, MSG_911 } from "@/lib/emergency/phrases";
import type { GetLabel } from "@/lib/emergency/respond";
import { ask } from "@/lib/pipeline/ask";
import { FakeAnswerClient } from "../../helpers/fake-ai";

// No label is saved: an informational question still shows the emergency message.
const getLabel: GetLabel = async (drug) => ({ found: false, drug });

// US1 scenarios 1–17. Scenarios 2 and 4 describe kinds of question rather than one
// question, so they use a question of that kind.
const SCENARIOS = [
  "I have the worst headache of my life, can I take Reyvow?",
  "My friend has sudden numbness, trouble speaking, and a swollen face",
  "I want to kill myself",
  "I HAVE CHETS PAIN after my Reyvow dose, it's been going on for an hour",
  "Does Reyvow cause chest pain?",
  "Does lasmiditan cause chest pain?",
  "Can galcanezumab cause trouble breathing?",
  "Does Reyvow cause seizures?",
  "I'm having chest pain after taking Reyvow",
  "reyvow chest pain",
  "Does Reyvo cause chest pain?",
  "Does Emgality cause suicide?",
  "I want to end my life",
  "reyvow suicide",
  "Does Reyvow cause chest pain or suicide?",
  "I have chest pain and I want to kill myself",
  "reyvow fainting suicide",
];

describe("emergency check first", () => {
  it("the fake answer AI is called 0 times for every phrase on the list and all 17 scenarios", async () => {
    const ai = new FakeAnswerClient();
    const questions = [
      ...EMERGENCY_PHRASES.flatMap((entry) => [entry.phrase, ...entry.variants]),
      ...SCENARIOS,
    ];
    for (const question of questions) {
      const reply = await ask(question, { getLabel, answerAI: ai });
      expect(reply.kind, question).toBe("emergency");
    }
    expect(ai.calls).toHaveLength(0);
  });

  it("an emergency phrase at character 1,200 of a 1,500-character question is still caught", async () => {
    const before = "I have a question about my migraine medicine and how it works. ".repeat(20);
    const padded = before.slice(0, 1200) + "chest pain";
    const question = (padded + " and some more words after it.".repeat(20)).slice(0, 1500);
    expect(question.length).toBe(1500);
    expect(question.indexOf("chest pain")).toBe(1200);
    const reply = await ask(question, { getLabel });
    expect(reply).toMatchObject({ kind: "emergency", messages: [MSG_911] });
  });

  it("emergency + dosing question → emergency wins", async () => {
    const reply = await ask("How much Reyvow should I take? I have chest pain.", { getLabel });
    expect(reply).toMatchObject({ kind: "emergency", messages: [MSG_911] });
  });

  it('a Spanish question containing "chest pain" still shows MSG_911', async () => {
    const reply = await ask("Tengo chest pain después de tomar Reyvow, ¿qué hago?", { getLabel });
    expect(reply).toMatchObject({ kind: "emergency", messages: [MSG_911] });
  });

  it("label lookup throws (database down) → 911 first, then 'The label doesn't cover this.'", async () => {
    const ai = new FakeAnswerClient();
    const failingLookup: GetLabel = async () => {
      throw new Error("database down");
    };
    const reply = await ask("Can galcanezumab cause trouble breathing?", {
      getLabel: failingLookup,
      answerAI: ai,
    });
    expect(reply).toEqual({
      kind: "emergency",
      case: "informational",
      messages: [MSG_911],
      label_excerpts: [],
      not_covered: true,
      disclaimer: "LabelTrace is an AI, not a doctor.",
    });
    expect(ai.calls).toHaveLength(0);
  });

  it("an emergency reply comes back in under 1 second", async () => {
    const start = performance.now();
    await ask("I have the worst headache of my life, can I take Reyvow?", { getLabel });
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
