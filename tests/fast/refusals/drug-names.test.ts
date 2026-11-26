// T024: the drug name lists (src/lib/refusals/other-drugs.json, drug-names.ts;
// research R20).
import { describe, expect, it } from "vitest";
import { OTHER_DRUG_NAMES } from "@/lib/refusals/drug-names";
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
