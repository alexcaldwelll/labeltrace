// T024: the drug-name script's cleaning step, tested with made-up openFDA replies (no
// internet).
import { describe, expect, it } from "vitest";
import { buildDrugNameFile, nameWords, QUERY_URLS } from "../../../scripts/build-drug-names";

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
