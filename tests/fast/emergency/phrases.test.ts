// T018: one test per emergency phrase id (FR-005, FR-010), using the main phrase and
// one other wording, plus capitals, a long sentence, a typo version (US1 scenario 4),
// and US1 scenarios 1–3 with the spec's questions. tests/fast/emergency/
// phrase-coverage.test.ts checks that every id in src/lib/emergency/phrases.ts has
// an entry here.
import { describe, expect, it } from "vitest";
import { detectEmergency } from "@/lib/emergency/detect";

// `variant` is left out for ids that have no other wordings. `mainAlso` is another id
// the main phrase also matches on purpose (contract section 2).
const cases: {
  id: string;
  group: "medical" | "self_harm";
  main: string;
  variant?: string;
  mainAlso?: string;
}[] = [
  // Medical
  {
    id: "worst_headache",
    group: "medical",
    main: "worst headache of my life",
    variant: "worst headache ever",
  },
  { id: "sudden_numbness", group: "medical", main: "sudden numbness", variant: "suddenly numb" },
  { id: "sudden_weakness", group: "medical", main: "sudden weakness", variant: "suddenly weak" },
  { id: "trouble_speaking", group: "medical", main: "trouble speaking", variant: "slurred speech" },
  { id: "fainting", group: "medical", main: "fainting", variant: "passed out" },
  { id: "chest_pain", group: "medical", main: "chest pain", variant: "chest tightness" },
  {
    id: "trouble_breathing",
    group: "medical",
    main: "trouble breathing",
    variant: "can't breathe",
  },
  { id: "swollen_face", group: "medical", main: "swollen face", variant: "face is swollen" },
  { id: "swollen_lips", group: "medical", main: "swollen lips", variant: "lips swelling" },
  { id: "swollen_throat", group: "medical", main: "swollen throat", variant: "throat closing" },
  // Medical, added 2026-11-25
  { id: "seizure", group: "medical", main: "seizure", variant: "having a seizure" },
  { id: "anaphylaxis", group: "medical", main: "anaphylaxis", variant: "severe allergic reaction" },
  { id: "swollen_tongue", group: "medical", main: "swollen tongue", variant: "tongue is swollen" },
  { id: "accidental_overdose", group: "medical", main: "took too much", variant: "overdosed on" },
  { id: "face_drooping", group: "medical", main: "face drooping", variant: "facial droop" },
  {
    id: "sudden_vision_loss",
    group: "medical",
    main: "sudden vision loss",
    variant: "lost my vision",
  },
  {
    id: "sudden_confusion",
    group: "medical",
    main: "sudden confusion",
    variant: "suddenly confused",
  },
  { id: "having_a_stroke", group: "medical", main: "having a stroke" },
  // Self-harm
  { id: "kill_myself", group: "self_harm", main: "kill myself", variant: "killing myself" },
  { id: "want_to_die", group: "self_harm", main: "want to die", variant: "wanna die" },
  { id: "suicide", group: "self_harm", main: "suicide", variant: "suicidal" },
  { id: "hurt_myself", group: "self_harm", main: "hurt myself", variant: "hurt my self" },
  { id: "end_my_life", group: "self_harm", main: "end my life", variant: "ending my life" },
  {
    id: "overdose_on_purpose",
    group: "self_harm",
    main: "overdose on purpose",
    variant: "overdose intentionally",
    // "overdose on" is 1 change from "overdosed on" (accidental_overdose): 911, then 988.
    mainAlso: "accidental_overdose",
  },
  // Self-harm, added 2026-11-25
  { id: "end_it_all", group: "self_harm", main: "end it all", variant: "ending it all" },
  { id: "better_off_dead", group: "self_harm", main: "better off dead" },
  {
    id: "dont_want_to_be_alive",
    group: "self_harm",
    main: "don't want to be alive",
    variant: "don't want to live",
  },
  { id: "self_harm", group: "self_harm", main: "self harm", variant: "self harming" },
  { id: "cut_myself", group: "self_harm", main: "cut myself", variant: "cutting myself" },
  { id: "no_reason_to_live", group: "self_harm", main: "no reason to live" },
];

describe("one test per phrase id", () => {
  for (const c of cases) {
    it(`${c.id}: main phrase${c.variant ? " and one other wording" : ""}`, () => {
      expect(detectEmergency(`Question: ${c.main}.`)).toEqual(
        c.mainAlso
          ? { ids: [c.mainAlso, c.id], groups: ["medical", "self_harm"] }
          : { ids: [c.id], groups: [c.group] },
      );
      if (c.variant) {
        expect(detectEmergency(`Question: ${c.variant}.`)).toEqual({
          ids: [c.id],
          groups: [c.group],
        });
      }
    });
  }
});

describe("intentional overdose shows both messages (contract section 2)", () => {
  it('"I overdosed on purpose" → 911 (accidental_overdose), then 988 (overdose_on_purpose)', () => {
    expect(detectEmergency("I overdosed on purpose")).toEqual({
      ids: ["accidental_overdose", "overdose_on_purpose"],
      groups: ["medical", "self_harm"],
    });
  });
});

describe("US1 scenario 4: capitals, long sentence, typo", () => {
  it("capitals", () => {
    expect(detectEmergency("I HAVE CHEST PAIN").ids).toEqual(["chest_pain"]);
  });

  it("inside a long sentence", () => {
    expect(
      detectEmergency(
        "I took my usual Reyvow dose this afternoon and about an hour later I started having trouble breathing while walking upstairs",
      ).ids,
    ).toEqual(["trouble_breathing"]);
  });

  it("a typo version", () => {
    expect(detectEmergency("I have chets pian").ids).toEqual(["chest_pain"]);
  });
});

describe("US1 scenarios 1–3 (spec's questions)", () => {
  it("scenario 1: worst headache of my life → medical", () => {
    expect(detectEmergency("I have the worst headache of my life, can I take Reyvow?")).toEqual({
      ids: ["worst_headache"],
      groups: ["medical"],
    });
  });

  it("scenario 2: a question mentioning the medical signs → medical", () => {
    const result = detectEmergency(
      "My friend has sudden numbness or weakness, trouble speaking, fainting, chest pain, trouble breathing, or a swollen face, lips, or throat.",
    );
    expect(result.groups).toEqual(["medical"]);
    expect(result.ids).toEqual(
      expect.arrayContaining([
        "sudden_numbness",
        "trouble_speaking",
        "fainting",
        "chest_pain",
        "trouble_breathing",
        "swollen_face",
      ]),
    );
  });

  it('scenario 3: "I want to kill myself" → self_harm', () => {
    expect(detectEmergency("I want to kill myself")).toEqual({
      ids: ["kill_myself"],
      groups: ["self_harm"],
    });
  });
});
