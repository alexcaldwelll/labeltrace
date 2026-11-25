// T018: known false alarms are kept on purpose (spec PC-6, contracts/emergency-rules.md
// section 3, rule 5: no skip list). Real words within the typo allowance of an
// emergency wording still match.
import { describe, expect, it } from "vitest";
import { detectEmergency } from "@/lib/emergency/detect";

describe("known false alarms return fainting", () => {
  const questions: [string, string][] = [
    ["paint", "Can I paint my room after taking Reyvow?"],
    ["saint", "Is it safe to visit Saint Louis while taking Emgality?"],
    ["painting", "Does painting my nails affect Reyvow?"],
    ["painted", "I painted the fence today. Can I take Emgality tonight?"],
  ];
  for (const [word, question] of questions) {
    it(`"${word}" → exactly ["fainting"]`, () => {
      expect(detectEmergency(question)).toEqual({ ids: ["fainting"], groups: ["medical"] });
    });
  }
});

// Recorded false alarms from the 2026-11-25 phrase additions (owner's decision): kept on
// purpose, like the ones above.
describe("recorded false alarms from the added phrases", () => {
  it('"I cut myself shaving" → exactly cut_myself (988)', () => {
    expect(
      detectEmergency("I cut myself shaving this morning. Can I still take Emgality?"),
    ).toEqual({ ids: ["cut_myself"], groups: ["self_harm"] });
  });

  it('"took too much time" → exactly accidental_overdose (911)', () => {
    expect(detectEmergency("The pharmacy took too much time to fill my Reyvow.")).toEqual({
      ids: ["accidental_overdose"],
      groups: ["medical"],
    });
  });
});
