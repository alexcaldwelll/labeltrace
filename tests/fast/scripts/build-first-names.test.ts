// T032: the first-name script's counting step, tested with made-up yearly files (no
// download, no zip).
import { describe, expect, it } from "vitest";

import {
  buildFirstNamesFile,
  MIN_TOTAL_BIRTHS,
  SOURCE_PAGE,
  SOURCE_URL,
  yearOf,
} from "../../../scripts/build-first-names";

const SHA = "a".repeat(64);
const FILES = [
  { year: 1990, text: "Alex,M,600\nAlex,F,300\nRare,F,999\nBig,M,5000\n" },
  { year: 1880, text: "Alex,M,100\nRare,M,0\n" },
];

describe("buildFirstNamesFile", () => {
  const file = buildFirstNamesFile(FILES, SHA, "2026-11-27");

  it("adds both sexes across years, and keeps names with 1,000+ births", () => {
    expect(MIN_TOTAL_BIRTHS).toBe(1000);
    // Alex: 600 + 300 + 100 = 1,000 (kept). Rare: 999 (left off). Big: 5,000.
    expect(file.names).toEqual(["alex", "big"]);
    expect(file.count).toBe(2);
  });

  it("records the source, date, checksum, and years", () => {
    expect(file.source_page).toBe(SOURCE_PAGE);
    expect(file.source_url).toBe(SOURCE_URL);
    expect(file.downloaded_on).toBe("2026-11-27");
    expect(file.sha256).toBe(SHA);
    expect([file.first_year, file.last_year]).toEqual([1880, 1990]);
  });

  it("stops on a line that isn't Name,Sex,Births", () => {
    expect(() =>
      buildFirstNamesFile([{ year: 2000, text: "Alex,X,5\n" }], SHA, "2026-11-27"),
    ).toThrow(/yob2000\.txt line 1/);
  });

  it("stops on a bad date or checksum", () => {
    expect(() => buildFirstNamesFile(FILES, SHA, "11/27/2026")).toThrow(/download date/);
    expect(() => buildFirstNamesFile(FILES, "abc", "2026-11-27")).toThrow(/SHA-256/);
  });
});

describe("yearOf", () => {
  it("reads the year from yearly file names only", () => {
    expect(yearOf("yob1990.txt")).toBe(1990);
    expect(yearOf("NationalReadMe.pdf")).toBeNull();
  });
});
