// T010 (moved here from T011): tests for the openFDA field → section name list.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SECTION_NAMES, labelSections } from "@/lib/labels/sections";

function fixtureRecord(drug: "emgality" | "reyvow"): Record<string, unknown> {
  const url = new URL(`../../fixtures/openfda/${drug}.json`, import.meta.url);
  const reply = JSON.parse(readFileSync(url, "utf8")) as { results: Record<string, unknown>[] };
  const record = reply.results[0];
  if (!record) throw new Error(`No label in the ${drug} fixture`);
  return record;
}

describe("SECTION_NAMES", () => {
  it("gives known fields the right names (research R7)", () => {
    expect(SECTION_NAMES.warnings_and_cautions).toBe("Warnings and Precautions");
    expect(SECTION_NAMES.adverse_reactions).toBe("Adverse Reactions");
    expect(SECTION_NAMES.dosage_and_administration).toBe("Dosage and Administration");
    expect(SECTION_NAMES.contraindications).toBe("Contraindications");
  });
});

describe("labelSections", () => {
  it("returns each known field with its name and text", () => {
    const sections = labelSections({
      warnings_and_cautions: ["5.1 Hypersensitivity"],
      adverse_reactions: ["Injection site reactions."],
    });
    expect(sections).toEqual([
      { field_key: "warnings_and_cautions", display_name: "Warnings and Precautions", text: "5.1 Hypersensitivity" },
      { field_key: "adverse_reactions", display_name: "Adverse Reactions", text: "Injection site reactions." },
    ]);
  });

  it("joins a field's text pieces with a blank line", () => {
    const [section] = labelSections({ contraindications: ["First part.", "Second part."] });
    expect(section?.text).toBe("First part.\n\nSecond part.");
  });

  it("skips empty fields", () => {
    const sections = labelSections({
      warnings_and_cautions: [],
      adverse_reactions: [""],
      contraindications: ["   ", "\n"],
      pregnancy: "not a list",
      overdosage: [42],
      description: ["Real text."],
    });
    expect(sections.map((s) => s.field_key)).toEqual(["description"]);
  });

  it("skips fields that aren't on the list", () => {
    const sections = labelSections({
      spl_product_data_elements: ["Emgality galcanezumab-gnlm"],
      package_label_principal_display_panel: ["PACKAGE LABEL"],
      set_id: "abc",
    });
    expect(sections).toEqual([]);
  });

  it.each(["emgality", "reyvow"] as const)(
    "finds the main sections in the real %s label, none of them empty",
    (drug) => {
      const sections = labelSections(fixtureRecord(drug));
      const keys = sections.map((s) => s.field_key);
      for (const key of [
        "indications_and_usage",
        "dosage_and_administration",
        "contraindications",
        "warnings_and_cautions",
        "adverse_reactions",
      ]) {
        expect(keys).toContain(key);
      }
      for (const s of sections) expect(s.text.trim()).not.toBe("");
    },
  );
});
