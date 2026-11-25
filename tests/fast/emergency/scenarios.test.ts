// T021: the emergency reply (src/lib/emergency/respond.ts; FR-046, FR-049, FR-050,
// FR-051, contracts/emergency-rules.md section 5). US1 scenarios 5–17, one test each,
// with the spec's exact questions. Labels come from tests/fixtures/openfda/.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MSG_911, MSG_988 } from "@/lib/emergency/phrases";
import { buildEmergencyReply, type GetLabel } from "@/lib/emergency/respond";
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

const getLabel: GetLabel = async (drug) => ({ found: true, label: fixtureLabel(drug) });
const reply = (question: string) => buildEmergencyReply(question, getLabel);

describe("US1 scenarios 5–17", () => {
  it("5. Informational: 'Does Reyvow cause chest pain?' → 911, then the label doesn't cover this", async () => {
    expect(await reply("Does Reyvow cause chest pain?")).toEqual({
      kind: "emergency",
      case: "informational",
      messages: [MSG_911],
      label_excerpts: [],
      not_covered: true,
    });
  });

  it("6. Informational, generic name (Reyvow): 'Does lasmiditan cause chest pain?' → same as 5", async () => {
    expect(await reply("Does lasmiditan cause chest pain?")).toEqual(
      await reply("Does Reyvow cause chest pain?"),
    );
  });

  it("7. Informational, generic name (Emgality): 'Can galcanezumab cause trouble breathing?' → 911, then Emgality sentences", async () => {
    const result = await reply("Can galcanezumab cause trouble breathing?");
    expect(result?.messages).toEqual([MSG_911]);
    expect(result?.case).toBe("informational");
    expect(result?.not_covered).toBe(false);
    expect(result?.label_excerpts.map((excerpt) => excerpt.drug)).toEqual(["emgality"]);
    expect(result?.label_excerpts[0]).toMatchObject({
      section: "Patient Information",
      label_date: "2026-06-05",
    });
  });

  it("8. Informational, label has no match: 'Does Reyvow cause seizures?' → 911, then the label doesn't cover this", async () => {
    expect(await reply("Does Reyvow cause seizures?")).toMatchObject({
      messages: [MSG_911],
      label_excerpts: [],
      not_covered: true,
    });
  });

  it("9. Happening now: 'I'm having chest pain after taking Reyvow' → 911 only, no label text", async () => {
    expect(await reply("I'm having chest pain after taking Reyvow")).toEqual({
      kind: "emergency",
      case: "happening_now",
      messages: [MSG_911],
      label_excerpts: [],
      not_covered: false,
    });
  });

  it("10. Unclear: 'reyvow chest pain' → 911 only, no label text", async () => {
    expect(await reply("reyvow chest pain")).toMatchObject({
      case: "unclear",
      messages: [MSG_911],
      label_excerpts: [],
      not_covered: false,
    });
  });

  it("11. Unclear, misspelled drug name: 'Does Reyvo cause chest pain?' → 911 only, no label text", async () => {
    expect(await reply("Does Reyvo cause chest pain?")).toMatchObject({
      case: "unclear",
      messages: [MSG_911],
      label_excerpts: [],
      not_covered: false,
    });
  });

  it("12. Self-harm, informational: 'Does Emgality cause suicide?' → 988 only, no label text", async () => {
    expect(await reply("Does Emgality cause suicide?")).toEqual({
      kind: "emergency",
      case: null,
      messages: [MSG_988],
      label_excerpts: [],
      not_covered: false,
    });
  });

  it("13. Self-harm, happening now: 'I want to end my life' → 988 only", async () => {
    expect(await reply("I want to end my life")).toMatchObject({
      messages: [MSG_988],
      label_excerpts: [],
    });
  });

  it("14. Self-harm, unclear: 'reyvow suicide' → 988 only", async () => {
    expect(await reply("reyvow suicide")).toMatchObject({
      messages: [MSG_988],
      label_excerpts: [],
    });
  });

  it("15. Mixed, informational: 'Does Reyvow cause chest pain or suicide?' → 911, then 988, no label text", async () => {
    expect(await reply("Does Reyvow cause chest pain or suicide?")).toMatchObject({
      messages: [MSG_911, MSG_988],
      label_excerpts: [],
      not_covered: false,
    });
  });

  it("16. Mixed, happening now: 'I have chest pain and I want to kill myself' → 911, then 988, no label text", async () => {
    expect(await reply("I have chest pain and I want to kill myself")).toMatchObject({
      messages: [MSG_911, MSG_988],
      label_excerpts: [],
    });
  });

  it("17. Mixed, unclear: 'reyvow fainting suicide' → 911, then 988, no label text", async () => {
    expect(await reply("reyvow fainting suicide")).toMatchObject({
      messages: [MSG_911, MSG_988],
      label_excerpts: [],
    });
  });
});

describe("reply rules", () => {
  const mixed = [
    "Does Reyvow cause chest pain or suicide?",
    "I have chest pain and I want to kill myself",
    "reyvow fainting suicide",
    "Does Emgality cause trouble breathing or make you want to die?",
  ];

  it("911 is always before 988", async () => {
    for (const question of mixed) {
      const result = await reply(question);
      expect(result?.messages).toEqual([MSG_911, MSG_988]);
    }
  });

  it("any self-harm match → no label text", async () => {
    for (const question of [
      ...mixed,
      "Does Emgality cause suicide?",
      "Can Reyvow make me suicidal?",
    ]) {
      expect((await reply(question))?.label_excerpts).toEqual([]);
    }
  });
});
