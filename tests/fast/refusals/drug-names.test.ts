// T024: the drug name lists (src/lib/refusals/other-drugs.json, drug-names.ts;
// research R20).
import { describe, expect, it } from "vitest";
import {
  DRUG_CLASS_PHRASES,
  DRUG_CLASS_WORDS,
  findDrugs,
  matchDrugWord,
  OTHER_DRUG_NAMES,
} from "@/lib/refusals/drug-names";
import otherDrugs from "@/lib/refusals/other-drugs.json";
import { QUERY_URLS } from "../../../scripts/build-drug-names";

describe("other-drugs.json", () => {
  it("our 4 names are never on the other list", () => {
    for (const name of ["emgality", "galcanezumab", "reyvow", "lasmiditan"]) {
      expect(otherDrugs.names).not.toContain(name);
      expect(OTHER_DRUG_NAMES.has(name)).toBe(false);
    }
  });

  it("Imitrex (sumatriptan) and Ubrelvy (ubrogepant) are on it", () => {
    for (const name of ["imitrex", "sumatriptan", "ubrelvy", "ubrogepant"]) {
      expect(otherDrugs.names).toContain(name);
    }
  });

  it("records its source URLs and download date", () => {
    expect(otherDrugs.query_urls).toEqual([...QUERY_URLS]);
    expect(otherDrugs.downloaded_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// Owner-approved tests (2026-11-26, item 6): one test per class word and phrase.
describe("drug-class words count as other drugs", () => {
  for (const word of DRUG_CLASS_WORDS) {
    it(word, () => {
      expect(matchDrugWord(word)).toEqual({ kind: "other", name: word });
    });
  }
  for (const phrase of DRUG_CLASS_PHRASES) {
    it(phrase, () => {
      expect(findDrugs(`Can I take Reyvow with a ${phrase}?`)).toContainEqual({
        kind: "other",
        name: phrase,
      });
    });
  }
});

// Owner-approved (2026-11-26, detail 4): the 12 brands the owner named are on the list.
describe("common brands", () => {
  it.each([
    "zoloft",
    "lexapro",
    "xanax",
    "prozac",
    "ambien",
    "benadryl",
    "ozempic",
    "aleve",
    "lyrica",
    "valium",
    "flexeril",
    "fioricet",
  ])("%s is on the list", (brand) => {
    expect(otherDrugs.names).toContain(brand);
  });
});

// Owner-approved (2026-11-26, detail 6): English words on the drug list don't count for
// the closer-English rule.
describe("closer-English rule", () => {
  it("'ibuprofin' → ibuprofen", () => {
    expect(matchDrugWord("ibuprofin")).toEqual({
      kind: "other",
      name: "ibuprofen",
      typedAs: "ibuprofin",
    });
  });
});
