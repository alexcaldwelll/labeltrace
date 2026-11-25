// T020: label sentences for informational medical emergency questions
// (src/lib/emergency/excerpts.ts; FR-048, contracts/emergency-rules.md section 6).
// Uses the saved openFDA labels in tests/fixtures/openfda/.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { drugsNamed, findExcerpts } from "@/lib/emergency/excerpts";
import type { CurrentLabel, Drug } from "@/lib/labels/store";
import { labelSections } from "@/lib/labels/sections";

function fixtureLabel(drug: Drug): CurrentLabel {
  const reply = JSON.parse(
    readFileSync(new URL(`../../fixtures/openfda/${drug}.json`, import.meta.url), "utf8"),
  ) as { results: Record<string, unknown>[] };
  const record = reply.results[0]!;
  const effective = String(record.effective_time);
  return {
    drug,
    labelId: "fixture",
    setId: String(record.set_id),
    labelDate: `${effective.slice(0, 4)}-${effective.slice(4, 6)}-${effective.slice(6, 8)}`,
    sections: labelSections(record),
  };
}

describe("label excerpts", () => {
  it("trouble breathing in Emgality returns the exact sentences (scenario 7)", () => {
    expect(findExcerpts(fixtureLabel("emgality"), ["trouble_breathing"])).toEqual([
      {
        drug: "emgality",
        section: "Patient Information",
        label_date: "2026-06-05",
        sentences: [
          "Allergic reactions, including itching, rash, hives, and trouble breathing, can happen after receiving EMGALITY.",
          "Call your healthcare provider or get emergency medical help right away if you have any of the following symptoms, which may be part of an allergic reaction: swelling of the face, mouth, tongue, or throat trouble breathing Constipation with serious complications.",
        ],
      },
    ]);
  });

  it("lasmiditan uses the Reyvow label", () => {
    expect(drugsNamed("Does lasmiditan cause chest pain?")).toEqual(["reyvow"]);
  });

  it("galcanezumab + trouble breathing uses the Emgality label", () => {
    const [drug] = drugsNamed("Can galcanezumab cause trouble breathing?");
    expect(drug).toBe("emgality");
    const excerpts = findExcerpts(fixtureLabel(drug!), ["trouble_breathing"]);
    expect(excerpts.map((excerpt) => excerpt.drug)).toEqual(["emgality"]);
    expect(excerpts[0]!.sentences.length).toBeGreaterThan(0);
  });

  it("chest pain in Reyvow → not covered (the label says 'chest discomfort', not 'chest pain')", () => {
    expect(findExcerpts(fixtureLabel("reyvow"), ["chest_pain"])).toEqual([]);
  });

  it("a phrase not in the label → not covered", () => {
    expect(findExcerpts(fixtureLabel("reyvow"), ["seizure"])).toEqual([]);
  });
});
