// T024: the drug-name script's cleaning step, tested with made-up openFDA replies (no
// internet).
import { describe, expect, it } from "vitest";
import {
  addCommonBrands,
  brandQueryUrls,
  buildDrugNameFile,
  nameWords,
  QUERY_URLS,
} from "../../../scripts/build-drug-names";

const english = new Set(["water", "relief", "migraine", "aspirin", "sodium", "dove", "newword"]);
const review = { kept: ["aspirin"], dropped: ["water", "relief", "migraine", "sodium", "dove"] };

const reply = (...terms: string[]) => ({ results: terms.map((term) => ({ term, count: 1 })) });
const REPLIES = [
  reply("Imitrex", "Migraine Relief", "Emgality"),
  reply("SUMATRIPTAN SUCCINATE", "Naproxen Sodium"),
  reply("Dove", "Water", "Aspirin", "Reyvow", "Galcanezumab", "BC"),
  reply("lasmiditan", "LASMIDITAN", "CGRP Formula", "Newword"),
];

describe("nameWords", () => {
  it("splits names into lowercase words of 4+ letters", () => {
    expect(nameWords(reply("Acetaminophen, Aspirin (NSAID) and Caffeine", "BC")).sort()).toEqual(
      ["acetaminophen", "aspirin", "caffeine", "nsaid"].sort(),
    );
  });
});

describe("buildDrugNameFile", () => {
  const { file, needsReview } = buildDrugNameFile(REPLIES, english, review, "2026-11-26");

  it("keeps non-English words and owner-kept English words", () => {
    expect(file.names).toEqual([
      "aspirin",
      "formula",
      "imitrex",
      "naproxen",
      "succinate",
      "sumatriptan",
    ]);
  });

  it("removes our 4 names and the 'never on the list' words", () => {
    for (const word of ["emgality", "reyvow", "galcanezumab", "lasmiditan", "cgrp"]) {
      expect(file.names).not.toContain(word);
    }
  });

  it("leaves off unreviewed English words and lists them for review", () => {
    expect(file.names).not.toContain("newword");
    expect(needsReview).toEqual(["newword"]);
  });

  it("records the query URLs, date, and count", () => {
    expect(file.query_urls).toEqual([...QUERY_URLS]);
    expect(file.downloaded_on).toBe("2026-11-26");
    expect(file.count).toBe(file.names.length);
  });
});

// Owner-approved (2026-11-26, detail 4): common brands, each confirmed by openFDA.
describe("addCommonBrands", () => {
  const { file } = buildDrugNameFile(REPLIES, english, review, "2026-11-26");
  const check = (brand: string, matches: number) => ({
    brand,
    dataset: "drug_label" as const,
    url: brandQueryUrls(brand)[0]!.url,
    matches,
  });

  it("adds confirmed brands and records how each was confirmed", () => {
    const result = addCommonBrands(file, ["zoloft"], [check("zoloft", 1)]);
    expect(result.names).toContain("zoloft");
    expect(result.count).toBe(result.names.length);
    expect(result.common_brands).toEqual([check("zoloft", 1)]);
  });

  it("an unconfirmed brand stops the script", () => {
    expect(() => addCommonBrands(file, ["zoloft"], [check("zoloft", 0)])).toThrow(/zoloft/);
    expect(() => addCommonBrands(file, ["xanax"], [])).toThrow(/xanax/);
  });
});
