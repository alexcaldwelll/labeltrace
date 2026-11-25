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
